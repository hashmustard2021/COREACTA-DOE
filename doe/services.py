from decimal import Decimal
from itertools import combinations, product

from .models import DesignRun, Factor, Result


BASE_LEVELS = [
    (-1, -1, -1),
    (-1, -1, 1),
    (-1, 1, -1),
    (-1, 1, 1),
    (1, -1, -1),
    (1, -1, 1),
    (1, 1, -1),
    (1, 1, 1),
]


def create_fractional_factorial_design(project):
    factors = list(project.factors.order_by("idx"))
    if not factors:
        raise ValueError("At least one factor is required.")

    project.design_runs.all().delete()
    runs = []

    for run_order, (a, b, c) in enumerate(BASE_LEVELS, start=1):
        base = {"A": a, "B": b, "C": c, "D": a * b * c}
        levels = {}
        values = {}

        for factor in factors:
            level = base[factor.key]
            levels[factor.key] = level
            values[factor.key] = str(pick_value(factor, "HIGH" if level == 1 else "LOW"))

        runs.append(
            DesignRun.objects.create(
                project=project,
                run_order=run_order,
                levels=levels,
                values=values,
            )
        )

    return runs


def upsert_result(project, run_order, response, note=""):
    try:
        design_run = project.design_runs.get(run_order=run_order)
    except DesignRun.DoesNotExist as exc:
        raise ValueError("Design run does not exist. Create the design first.") from exc

    result, _ = Result.objects.update_or_create(
        design_run=design_run,
        defaults={"response": response, "note": note},
    )
    return result


def build_report(project):
    factors = list(project.factors.order_by("idx"))
    effects = calculate_main_effects(project, factors)
    valid_effects = [effect for effect in effects if effect["effect"] is not None]
    top_drivers = sorted(
        valid_effects, key=lambda item: abs(item["effect"]), reverse=True
    )

    recommendations = recommend_next_runs(factors, top_drivers, project)
    message = ""
    if len(valid_effects) < 2:
        message = "유효한 effect가 2개 미만입니다. 결과 데이터를 더 입력해주세요."

    return {
        "project": {"id": project.id, "name": project.name},
        "effects": effects,
        "top_drivers": top_drivers,
        "message": message,
        "recommendations": recommendations,
    }


def calculate_main_effects(project, factors):
    runs = project.design_runs.select_related("result").all()
    effects = []

    for factor in factors:
        high_values = []
        low_values = []

        for run in runs:
            if not hasattr(run, "result"):
                continue

            level = run.levels.get(factor.key)
            if level == 1:
                high_values.append(run.result.response)
            elif level == -1:
                low_values.append(run.result.response)

        effect = None
        direction = "NEUTRAL"
        if high_values and low_values:
            effect = mean(high_values) - mean(low_values)
            if effect > 0:
                direction = "HIGH"
            elif effect < 0:
                direction = "LOW"

        effects.append(
            {
                "factor_idx": factor.idx,
                "factor_key": factor.key,
                "display_name": factor.display_name,
                "effect": effect,
                "direction": direction,
            }
        )

    return effects


def recommend_next_runs(factors, top_drivers, project=None):
    if project is not None:
        try:
            model_recommendations = recommend_model_based_next_runs(project, factors)
            if model_recommendations:
                return model_recommendations
        except (ArithmeticError, KeyError, TypeError, ValueError):
            pass

    rule_based_recommendations = recommend_rule_based_next_runs(factors, top_drivers)
    if rule_based_recommendations:
        return rule_based_recommendations
    return [midpoint_recommendation(factors)]


def recommend_rule_based_next_runs(factors, top_drivers):
    valid_effects = [effect for effect in top_drivers if effect["effect"] is not None]
    if len(valid_effects) < 2:
        return []

    top1 = valid_effects[0]
    top2 = valid_effects[1]
    candidates = [
        {top1["factor_key"]: top1["direction"], top2["factor_key"]: top2["direction"]},
        {
            top1["factor_key"]: opposite_direction(top1["direction"]),
            top2["factor_key"]: top2["direction"],
        },
        {
            top1["factor_key"]: top1["direction"],
            top2["factor_key"]: opposite_direction(top2["direction"]),
        },
    ]

    recommendations = []
    for idx, directions in enumerate(candidates, start=1):
        conditions = {}
        for factor in factors:
            direction = directions.get(factor.key, "NEUTRAL")
            conditions[factor.key] = {
                "factor_idx": factor.idx,
                "display_name": factor.display_name,
                "direction": direction,
                "value": pick_value(factor, direction),
            }

        recommendations.append(
            {
                "rank": idx,
                "strategy": recommendation_strategy(idx, top1, top2),
                "conditions": conditions,
            }
        )

    return recommendations


def recommend_model_based_next_runs(project, factors):
    observations = list(model_observations(project, factors))
    if len(observations) < 4:
        return []

    feature_names = model_feature_names(factors)
    coefficients = fit_ridge_model(observations, feature_names)
    completed_conditions = completed_condition_keys(project, factors)

    candidates = []
    for levels in product(("LOW", "NEUTRAL", "HIGH"), repeat=len(factors)):
        conditions = {}
        coded_values = {}
        values = []

        for factor, direction in zip(factors, levels):
            value = pick_value(factor, direction)
            conditions[factor.key] = {
                "factor_idx": factor.idx,
                "display_name": factor.display_name,
                "direction": direction,
                "value": value,
            }
            coded_values[factor.key] = float(code_value(factor, value))
            values.append(value)

        if condition_key(values) in completed_conditions:
            continue

        predicted = predict_response(coefficients, feature_names, coded_values)
        candidates.append((predicted, conditions))

    if not candidates:
        return [midpoint_recommendation(factors)]

    candidates.sort(key=lambda item: item[0], reverse=True)
    recommendations = []
    for rank, (predicted, conditions) in enumerate(candidates[:3], start=1):
        recommendations.append(
            {
                "rank": rank,
                "strategy": "예측 모델 기준 수율이 높게 예상됨",
                "conditions": conditions,
                "predicted_yield": round(predicted, 2),
            }
        )

    return recommendations


def model_observations(project, factors):
    for run in project.design_runs.select_related("result").order_by("run_order"):
        if not hasattr(run, "result"):
            continue

        coded_values = {}
        for factor in factors:
            raw_value = run.values.get(factor.key)
            if raw_value is None:
                raw_value = pick_value(
                    factor,
                    "HIGH" if run.levels.get(factor.key) == 1 else "LOW",
                )
            coded_values[factor.key] = float(code_value(factor, Decimal(str(raw_value))))

        yield {
            "coded_values": coded_values,
            "response": float(run.result.response),
        }


def model_feature_names(factors):
    factor_keys = [factor.key for factor in factors]
    interaction_keys = [
        f"{left}:{right}" for left, right in combinations(factor_keys, 2)
    ]
    return ["intercept", *factor_keys, *interaction_keys]


def feature_vector(feature_names, coded_values):
    vector = []
    for feature_name in feature_names:
        if feature_name == "intercept":
            vector.append(1.0)
        elif ":" in feature_name:
            left, right = feature_name.split(":", 1)
            vector.append(coded_values[left] * coded_values[right])
        else:
            vector.append(coded_values[feature_name])
    return vector


def fit_ridge_model(observations, feature_names, regularization=0.01):
    rows = [
        feature_vector(feature_names, observation["coded_values"])
        for observation in observations
    ]
    responses = [observation["response"] for observation in observations]
    size = len(feature_names)
    matrix = [[0.0 for _ in range(size)] for _ in range(size)]
    rhs = [0.0 for _ in range(size)]

    for row, response in zip(rows, responses):
        for i in range(size):
            rhs[i] += row[i] * response
            for j in range(size):
                matrix[i][j] += row[i] * row[j]

    for i in range(1, size):
        matrix[i][i] += regularization

    return solve_linear_system(matrix, rhs)


def solve_linear_system(matrix, rhs):
    size = len(rhs)
    augmented = [row[:] + [rhs[index]] for index, row in enumerate(matrix)]

    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            raise ValueError("Prediction model could not be fitted.")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]

        pivot_value = augmented[column][column]
        for item in range(column, size + 1):
            augmented[column][item] /= pivot_value

        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            for item in range(column, size + 1):
                augmented[row][item] -= factor * augmented[column][item]

    return [augmented[row][size] for row in range(size)]


def predict_response(coefficients, feature_names, coded_values):
    vector = feature_vector(feature_names, coded_values)
    return sum(coefficient * value for coefficient, value in zip(coefficients, vector))


def completed_condition_keys(project, factors):
    keys = set()
    for run in project.design_runs.order_by("run_order"):
        values = []
        for factor in factors:
            value = run.values.get(factor.key)
            if value is None:
                continue
            values.append(Decimal(str(value)))
        if len(values) == len(factors):
            keys.add(condition_key(values))
    return keys


def condition_key(values):
    return tuple(Decimal(str(value)).normalize() for value in values)


def midpoint_recommendation(factors):
    conditions = {}
    for factor in factors:
        conditions[factor.key] = {
            "factor_idx": factor.idx,
            "display_name": factor.display_name,
            "direction": "NEUTRAL",
            "value": factor.mid,
        }

    return {
        "rank": 1,
        "strategy": "추천 가능한 후보가 없어 중간 조건을 제안",
        "conditions": conditions,
        "predicted_yield": None,
    }


def opposite_direction(direction):
    if direction == "HIGH":
        return "LOW"
    if direction == "LOW":
        return "HIGH"
    return "NEUTRAL"


def pick_value(factor, direction):
    if direction == "HIGH":
        return factor.high
    if direction == "LOW":
        return factor.low
    return factor.mid


def recommendation_strategy(rank, top1, top2):
    if rank == 1:
        return f"Top drivers {top1['factor_key']}, {top2['factor_key']}의 유리한 방향 조합"
    if rank == 2:
        return f"{top1['factor_key']} 반대 방향 확인"
    return f"{top2['factor_key']} 반대 방향 확인"


def mean(values):
    return sum(values, Decimal("0")) / Decimal(len(values))


def build_response_surface(project, x_factor_name, y_factor_name, grid_size=11):
    factors = list(project.factors.order_by("idx"))
    x_factor = find_factor(factors, x_factor_name)
    y_factor = find_factor(factors, y_factor_name)

    if not x_factor or not y_factor:
        raise ValueError("Selected factor was not found.")
    if x_factor.id == y_factor.id:
        raise ValueError("Choose two different factors.")

    observations = []
    for run in project.design_runs.select_related("result").order_by("run_order"):
        if not hasattr(run, "result"):
            continue

        x_level = Decimal(str(run.levels.get(x_factor.key, 0)))
        y_level = Decimal(str(run.levels.get(y_factor.key, 0)))
        observations.append(
            {
                "x": x_level,
                "y": y_level,
                "xy": x_level * y_level,
                "response": run.result.response,
            }
        )

    if len(observations) < 4:
        raise ValueError("시각화할 데이터가 충분하지 않습니다.")

    intercept = mean([item["response"] for item in observations])
    x_coef = mean([item["response"] * item["x"] for item in observations])
    y_coef = mean([item["response"] * item["y"] for item in observations])
    xy_coef = mean([item["response"] * item["xy"] for item in observations])

    x_values = grid_values(x_factor.low, x_factor.high, grid_size)
    y_values = grid_values(y_factor.low, y_factor.high, grid_size)
    z_matrix = []

    for y_value in y_values:
        y_coded = code_value(y_factor, y_value)
        row = []
        for x_value in x_values:
            x_coded = code_value(x_factor, x_value)
            predicted = (
                intercept
                + x_coef * x_coded
                + y_coef * y_coded
                + xy_coef * x_coded * y_coded
            )
            row.append(round(float(predicted), 4))
        z_matrix.append(row)

    return {
        "x_factor": x_factor.display_name,
        "y_factor": y_factor.display_name,
        "x_values": [float(value) for value in x_values],
        "y_values": [float(value) for value in y_values],
        "z_matrix": z_matrix,
        "model": "coded linear + x*y interaction approximation",
    }


def find_factor(factors, value):
    if not value:
        return None

    normalized = str(value).strip()
    for factor in factors:
        if normalized in {
            factor.key,
            factor.name_kr,
            factor.name_en,
            factor.display_name,
            str(factor.idx),
        }:
            return factor
    return None


def grid_values(low, high, grid_size):
    if grid_size < 2:
        return [low]

    step = (high - low) / Decimal(grid_size - 1)
    return [low + step * Decimal(index) for index in range(grid_size)]


def code_value(factor, value):
    midpoint = factor.mid
    half_range = (factor.high - factor.low) / Decimal("2")
    if half_range == 0:
        return Decimal("0")
    return (value - midpoint) / half_range
