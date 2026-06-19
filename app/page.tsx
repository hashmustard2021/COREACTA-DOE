"use client";

import {
  Fragment,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Copy,
  Download,
  FileText,
  FlaskConical,
  Play,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message: string;
};

type User = {
  id: number;
  username: string;
  email: string;
};

type FactorInput = {
  idx: number;
  factor_type: "continuous" | "categorical";
  name_kr: string;
  name_en: string;
  unit: string;
  low: string;
  high: string;
  levels: string;
};

type FactorFieldErrors = Record<number, Partial<Record<keyof FactorInput, string>>>;

type YieldErrors = Record<number, string>;

type FactorPresetId =
  | "temperature"
  | "time"
  | "catalyst_loading"
  | "concentration"
  | "solvent"
  | "base"
  | "custom";

type ProjectFactor = {
  id: number;
  idx: number;
  factor_type: "continuous" | "categorical";
  name_kr: string;
  name_en: string;
  unit: string;
  low: string | null;
  high: string | null;
  levels: string[];
  display_name: string;
};

type Project = {
  id: number;
  name: string;
  description?: string;
  slogan: string;
  response_name: string;
  goal: string;
  run_budget: number;
  include_center_points: boolean;
  factors: ProjectFactor[];
};

type ProjectListItem = {
  project_id: number;
  name: string;
  created_at: string;
  run_budget: number;
  include_center_points: boolean;
  response_name: string;
  factor_count: number;
  result_count: number;
};

type DuplicateProjectResponse = {
  project_id: number;
};

type DesignRun = {
  id: number;
  run_order: number;
  levels: Record<string, number>;
  values: Record<string, string>;
  result: null | {
    response: string;
    note: string;
    updated_at: string;
  };
};

type Effect = {
  factor_idx: number;
  factor_key: string;
  factor_type: "continuous" | "categorical";
  display_name: string;
  effect: number | null;
  effect_abs?: number | null;
  direction: "HIGH" | "LOW" | "NEUTRAL";
  direction_label?: string;
  interpretation?: string;
};

type Recommendation = {
  rank: number;
  strategy: string;
  predicted_yield?: number | null;
  conditions: Record<
    string,
    {
      factor_idx: number;
      display_name: string;
      direction: "HIGH" | "LOW" | "NEUTRAL";
      direction_label?: string;
      value: number | string;
      unit?: string;
      low?: number | string;
      high?: number | string;
      factor_type?: "continuous" | "categorical";
      levels?: string[];
    }
  >;
};

type Report = {
  project: { id: number; name: string };
  effects: Effect[];
  top_drivers: Effect[];
  message: string;
  recommendations: Recommendation[];
  interpretation: string[];
  pareto: Array<{
    factor_key: string;
    factor: string;
    effect: number | null;
    effect_abs: number | null;
    direction: "HIGH" | "LOW" | "NEUTRAL";
    direction_label?: string;
  }>;
  curvature: {
    available: boolean;
    has_curvature: boolean;
    factorial_mean: number | null;
    center_mean: number | null;
    effect: number | null;
    message: string;
  };
  anova: Array<{
    factor_key: string;
    factor: string;
    effect: number | null;
    p_value: number | null;
    significant: boolean;
  }>;
};

type SurfaceData = {
  x_factor: string;
  y_factor: string;
  x_values: number[];
  y_values: number[];
  z_matrix: number[][];
  model: string;
};

type ResultRecord = {
  id: number;
  run_order: number;
  response: string;
  note: string;
  created_at: string;
  updated_at: string;
};

type ResultHistoryRecord = {
  id: number;
  run_order: number;
  old_y: string;
  new_y: string;
  changed_by: string;
  changed_at: string;
};

type ProjectDetail = {
  project: Project;
  factors: Project["factors"];
  design_runs: DesignRun[];
  results: ResultRecord[];
};

const defaultFactors: FactorInput[] = [
  {
    idx: 1,
    factor_type: "continuous",
    name_kr: "온도",
    name_en: "Temperature",
    unit: "°C",
    low: "60",
    high: "90",
    levels: "",
  },
  {
    idx: 2,
    factor_type: "continuous",
    name_kr: "시간",
    name_en: "Time",
    unit: "h",
    low: "1",
    high: "4",
    levels: "",
  },
  {
    idx: 3,
    factor_type: "continuous",
    name_kr: "촉매량",
    name_en: "Catalyst loading",
    unit: "mol%",
    low: "0.5",
    high: "5",
    levels: "",
  },
  {
    idx: 4,
    factor_type: "continuous",
    name_kr: "농도",
    name_en: "Concentration",
    unit: "M",
    low: "0.05",
    high: "0.30",
    levels: "",
  },
];

const factorPresetOptions: Array<{
  id: FactorPresetId;
  label: string;
  description: string;
  example: string;
  factor: Omit<FactorInput, "idx"> | null;
}> = [
  {
    id: "temperature",
    label: "온도 / Temperature",
    description: "범위 조건",
    example: "예: 60-90 °C처럼 낮은 값과 높은 값을 정합니다.",
    factor: {
      factor_type: "continuous",
      name_kr: "온도",
      name_en: "Temperature",
      unit: "°C",
      low: "60",
      high: "90",
      levels: "",
    },
  },
  {
    id: "time",
    label: "시간 / Time",
    description: "범위 조건",
    example: "예: 1-4 h처럼 반응 시간을 어느 범위에서 볼지 정합니다.",
    factor: {
      factor_type: "continuous",
      name_kr: "시간",
      name_en: "Time",
      unit: "h",
      low: "1",
      high: "4",
      levels: "",
    },
  },
  {
    id: "catalyst_loading",
    label: "촉매량 / Catalyst loading",
    description: "범위 조건",
    example: "예: 0.5-5 mol%처럼 투입량의 낮은 값과 높은 값을 정합니다.",
    factor: {
      factor_type: "continuous",
      name_kr: "촉매량",
      name_en: "Catalyst loading",
      unit: "mol%",
      low: "0.5",
      high: "5",
      levels: "",
    },
  },
  {
    id: "concentration",
    label: "농도 / Concentration",
    description: "범위 조건",
    example: "예: 0.05-0.30 M처럼 희석/농축 범위를 정합니다.",
    factor: {
      factor_type: "continuous",
      name_kr: "농도",
      name_en: "Concentration",
      unit: "M",
      low: "0.05",
      high: "0.30",
      levels: "",
    },
  },
  {
    id: "solvent",
    label: "용매 / Solvent",
    description: "후보 조건",
    example: "예: THF와 Toluene처럼 비교할 후보 2개를 고릅니다.",
    factor: {
      factor_type: "categorical",
      name_kr: "용매",
      name_en: "Solvent",
      unit: "",
      low: "",
      high: "",
      levels: "THF, Toluene",
    },
  },
  {
    id: "base",
    label: "염기 / Base",
    description: "후보 조건",
    example: "예: K2CO3와 Cs2CO3처럼 비교할 후보 2개를 고릅니다.",
    factor: {
      factor_type: "categorical",
      name_kr: "염기",
      name_en: "Base",
      unit: "",
      low: "",
      high: "",
      levels: "K2CO3, Cs2CO3",
    },
  },
  {
    id: "custom",
    label: "직접 입력 / Custom",
    description: "현재 입력값 유지",
    example: "직접 조건 이름과 값을 입력합니다.",
    factor: null,
  },
];

function factorFromPreset(idx: number, presetId: FactorPresetId): FactorInput {
  const preset = factorPresetOptions.find((option) => option.id === presetId);
  if (!preset?.factor) {
    return {
      idx,
      factor_type: "continuous",
      name_kr: "",
      name_en: "",
      unit: "",
      low: "",
      high: "",
      levels: "",
    };
  }
  return { idx, ...preset.factor };
}

function factorPresetId(factor: FactorInput): FactorPresetId {
  const matched = factorPresetOptions.find((option) => {
    if (!option.factor) return false;
    return (
      option.factor.factor_type === factor.factor_type &&
      option.factor.name_kr === factor.name_kr &&
      option.factor.name_en === factor.name_en
    );
  });
  return matched?.id ?? "custom";
}

function getCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length !== 2) return "";
  return parts.pop()?.split(";").shift() ?? "";
}

async function ensureCsrfToken() {
  if (getCookie("csrftoken")) return;
  await fetch(`${API_BASE_URL}/api/auth/csrf/`, {
    credentials: "include",
    mode: "cors",
    cache: "no-store",
  });
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    await ensureCsrfToken();
    headers["X-CSRFToken"] = getCookie("csrftoken");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    mode: "cors",
    cache: "no-store",
    headers,
  });

  let body: ApiResponse<T | null>;
  try {
    body = (await response.json()) as ApiResponse<T | null>;
  } catch {
    throw new Error(`API did not return JSON. HTTP ${response.status}`);
  }

  if (!response.ok || !body.success) {
    throw new Error(body.message || `API request failed: ${response.status}`);
  }

  return body.data as T;
}

function formatFactorValue(run: DesignRun, factorKey: string) {
  return run.values[factorKey] ?? "-";
}

function formatEffect(effect: number | null) {
  if (effect === null) return "-";
  return Number(effect).toFixed(2);
}

function formatImpact(effect: Effect) {
  const value = effect.effect_abs ?? (effect.effect === null ? null : Math.abs(Number(effect.effect)));
  if (value === null) return "-";
  return Number(value).toFixed(2);
}

function effectDirectionLabel(effect: number) {
  if (effect > 0) return "HIGH가 유리";
  if (effect < 0) return "LOW가 유리";
  return "NEUTRAL";
}

function factorDisplayName(factor: FactorInput) {
  return `${factor.name_kr}(${factor.name_en}${factor.unit ? `, ${factor.unit}` : ""})`;
}

function parseFactorLevels(levels: string) {
  return levels
    .split(/[\n,]/)
    .map((level) => level.trim())
    .filter(Boolean);
}

function validateYieldInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) {
    return "수율은 숫자로 입력해주세요. 예: 61.5";
  }
  if (numericValue < 0 || numericValue > 100) {
    return "수율은 0-100% 범위로 입력해주세요.";
  }
  return "";
}

function serializeFactorInput(factor: FactorInput) {
  if (factor.factor_type === "categorical") {
    return {
      idx: factor.idx,
      factor_type: "categorical",
      name_kr: factor.name_kr,
      name_en: factor.name_en,
      unit: "",
      low: null,
      high: null,
      levels: parseFactorLevels(factor.levels),
    };
  }

  return {
    idx: factor.idx,
    factor_type: "continuous",
    name_kr: factor.name_kr,
    name_en: factor.name_en,
    unit: factor.unit,
    low: factor.low,
    high: factor.high,
    levels: [],
  };
}

function validateFactorsForSubmit(factors: FactorInput[]) {
  const errors: FactorFieldErrors = {};

  const addError = (idx: number, field: keyof FactorInput, message: string) => {
    errors[idx] = {
      ...(errors[idx] ?? {}),
      [field]: message,
    };
  };

  for (const factor of factors) {
    if (!factor.name_kr.trim()) {
      addError(factor.idx, "name_kr", "한글 조건명을 입력해주세요. 예: 온도");
    }
    if (!factor.name_en.trim()) {
      addError(factor.idx, "name_en", "영문 조건명을 입력해주세요. 예: Temperature");
    }

    if (factor.factor_type === "continuous") {
      const low = Number(factor.low);
      const high = Number(factor.high);
      if (!factor.unit.trim()) {
        addError(factor.idx, "unit", "단위를 입력해주세요. 예: °C, h, mol%");
      }
      if (!factor.low.trim()) {
        addError(factor.idx, "low", "낮은 값을 입력해주세요.");
      }
      if (!factor.high.trim()) {
        addError(factor.idx, "high", "높은 값을 입력해주세요.");
      }
      if (factor.low.trim() && !Number.isFinite(low)) {
        addError(factor.idx, "low", "숫자로 입력해주세요. 예: 60");
      }
      if (factor.high.trim() && !Number.isFinite(high)) {
        addError(factor.idx, "high", "숫자로 입력해주세요. 예: 90");
      }
      if (Number.isFinite(low) && Number.isFinite(high) && low >= high) {
        addError(factor.idx, "low", "낮은 값은 높은 값보다 작아야 합니다.");
        addError(factor.idx, "high", "높은 값은 낮은 값보다 커야 합니다.");
      }
      continue;
    }

    const levels = parseFactorLevels(factor.levels);
    if (levels.length < 2) {
      addError(factor.idx, "levels", "비교할 후보 2개를 쉼표로 입력해주세요. 예: THF, Toluene");
    }
    if (levels.length > 2) {
      addError(factor.idx, "levels", "현재 v2 MVP에서는 후보 조건은 2개만 지원합니다.");
    }
  }

  return {
    errors,
    message: Object.keys(errors).length
      ? "입력값을 확인해주세요. 표시된 위치의 안내에 맞게 수정하면 됩니다."
      : "",
  };
}

function continuousFactors(factors: FactorInput[]) {
  return factors.filter((factor) => factor.factor_type === "continuous");
}

function defaultContinuousFields(idx: number) {
  const fallback = defaultFactors.find((factor) => factor.idx === idx);
  return {
    name_kr: fallback?.name_kr || "",
    name_en: fallback?.name_en || "",
    unit: fallback?.unit || "",
    low: fallback?.low || "0",
    high: fallback?.high || "1",
  };
}

function defaultCategoricalFields(idx: number) {
  const preset = factorFromPreset(idx, idx % 2 === 1 ? "solvent" : "base");
  return {
    name_kr: preset.name_kr,
    name_en: preset.name_en,
    levels: preset.levels,
  };
}

function normalizeGoal(goal?: string): "maximize" | "minimize" {
  return goal === "minimize" ? "minimize" : "maximize";
}

function heatColor(value: number, min: number, max: number) {
  if (max === min) return "hsl(174, 50%, 60%)";
  const ratio = (value - min) / (max - min);
  const hue = 205 - ratio * 175;
  const lightness = 88 - ratio * 38;
  return `hsl(${hue}, 70%, ${lightness}%)`;
}

function formatConditionValue(condition: Recommendation["conditions"][string]) {
  const numericValue = Number(condition.value);
  const numericLow = Number(condition.low);
  const numericHigh = Number(condition.high);
  const value =
    Number.isFinite(numericValue) &&
    Number.isFinite(numericLow) &&
    Number.isFinite(numericHigh)
      ? Math.min(Math.max(numericValue, numericLow), numericHigh)
      : condition.value;
  const displayValue =
    typeof value === "number" && Number.isFinite(value)
      ? Number(value.toFixed(4)).toString()
      : String(value);

  return condition.unit ? `${displayValue} ${condition.unit}` : displayValue;
}

function HelpTip({ label, children }: { label: string; children: string }) {
  return (
    <span className="help-popover term-help">
      <button
        type="button"
        className="help-popover-button"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        ?
      </button>
      <span role="tooltip">{children}</span>
    </span>
  );
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [projectName, setProjectName] = useState("Suzuki coupling optimization");
  const [projectSlogan, setProjectSlogan] = useState("감이 아니라 근거로 실험하세요.");
  const [responseName, setResponseName] = useState("Yield");
  const [projectGoal, setProjectGoal] = useState<"maximize" | "minimize">("maximize");
  const [factors, setFactors] = useState<FactorInput[]>(defaultFactors);
  const [isIntroComplete, setIsIntroComplete] = useState(false);
  const [isSetupStarted, setIsSetupStarted] = useState(false);
  const [includeCenterPoints, setIncludeCenterPoints] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [designRuns, setDesignRuns] = useState<DesignRun[]>([]);
  const [yields, setYields] = useState<Record<number, string>>({});
  const [yieldErrors, setYieldErrors] = useState<YieldErrors>({});
  const [report, setReport] = useState<Report | null>(null);
  const [resultHistory, setResultHistory] = useState<ResultHistoryRecord[]>([]);
  const [expandedHistoryRuns, setExpandedHistoryRuns] = useState<Record<number, boolean>>({});
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [factorErrors, setFactorErrors] = useState<FactorFieldErrors>({});
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectList, setProjectList] = useState<ProjectListItem[]>([]);
  const [surfaceData, setSurfaceData] = useState<SurfaceData | null>(null);
  const [surfaceMessage, setSurfaceMessage] = useState(
    "Update Surface를 눌러 contour plot을 생성하세요.",
  );
  const [surfaceXFactor, setSurfaceXFactor] = useState(factorDisplayName(defaultFactors[0]));
  const [surfaceYFactor, setSurfaceYFactor] = useState(factorDisplayName(defaultFactors[2]));
  const yieldInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const factorKeys = useMemo(
    () => factors.map((factor) => "ABCD"[factor.idx - 1]),
    [factors],
  );
  const surfaceFactorOptions = useMemo(() => continuousFactors(factors), [factors]);
  const hasContinuousFactor = surfaceFactorOptions.length > 0;
  const categoricalFactorCount = factors.filter(
    (factor) => factor.factor_type === "categorical",
  ).length;
  const isRangeOnlySetup = categoricalFactorCount === 0;
  const availableFactorPresetOptions = useMemo(
    () =>
      factorPresetOptions.filter((option) => {
        if (!isRangeOnlySetup) return true;
        return !option.factor || option.factor.factor_type === "continuous";
      }),
    [isRangeOnlySetup],
  );
  const mainEffectData = useMemo(() => {
    if (!report) return [];

    return report.top_drivers
      .filter((effect) => effect.effect !== null)
      .sort((a, b) => Math.abs(Number(b.effect)) - Math.abs(Number(a.effect)))
      .map((effect) => {
        const value = Number(effect.effect);
        return {
          key: effect.factor_key,
          name: effect.display_name,
          effect: value,
          directionLabel: effect.direction_label || effectDirectionLabel(value),
        };
      });
  }, [report]);
  const yieldTrendData = useMemo(
    () =>
      designRuns
        .map((run) => {
          const yieldValue = yields[run.run_order] || run.result?.response || "";
          return {
            run: run.run_order,
            yield: yieldValue.trim() ? Number(yieldValue) : null,
          };
        })
        .filter((item) => item.yield !== null && Number.isFinite(item.yield)),
    [designRuns, yields],
  );
  const historyByRun = useMemo(() => {
    return resultHistory.reduce<Record<number, ResultHistoryRecord[]>>((grouped, item) => {
      grouped[item.run_order] = grouped[item.run_order] ?? [];
      grouped[item.run_order].push(item);
      return grouped;
    }, {});
  }, [resultHistory]);
  const paretoData = useMemo(() => {
    if (!report) return [];
    return report.pareto
      .filter((item) => item.effect_abs !== null)
      .map((item) => ({
        key: item.factor_key,
        name: item.factor,
        effectAbs: Number(item.effect_abs),
        direction: item.direction,
        directionLabel: item.direction_label || item.direction,
      }));
  }, [report]);
  const surfaceScale = useMemo(() => {
    if (!surfaceData) return { min: 0, max: 0 };
    const values = surfaceData.z_matrix.flat();
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [surfaceData]);

  useEffect(() => {
    void initializeAuth();
  }, []);

  useEffect(() => {
    if (!hasContinuousFactor && includeCenterPoints) {
      setIncludeCenterPoints(false);
    }
  }, [hasContinuousFactor, includeCenterPoints]);

  useEffect(() => {
    if (surfaceFactorOptions.length === 0) {
      setSurfaceData(null);
      setSurfaceMessage("Contour plot requires at least two continuous factors.");
      return;
    }

    const optionNames = surfaceFactorOptions.map(factorDisplayName);
    if (!optionNames.includes(surfaceXFactor)) {
      setSurfaceXFactor(optionNames[0]);
    }
    if (!optionNames.includes(surfaceYFactor)) {
      setSurfaceYFactor(optionNames[1] ?? optionNames[0]);
    }
  }, [surfaceFactorOptions, surfaceXFactor, surfaceYFactor]);

  async function initializeAuth() {
    try {
      await ensureCsrfToken();
      const user = await apiRequest<User>("/api/auth/me/");
      setCurrentUser(user);
      await loadProjects();
    } catch {
      setCurrentUser(null);
    } finally {
      setIsAuthChecked(true);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      const user = await apiRequest<User>("/api/auth/login/", {
        method: "POST",
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });
      setCurrentUser(user);
      setLoginPassword("");
      setStatusText(`Logged in as ${user.username}.`);
      await loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogout() {
    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      await apiRequest<Record<string, never>>("/api/auth/logout/", { method: "POST" });
      setCurrentUser(null);
      setProject(null);
      setProjectName("Suzuki coupling optimization");
      setProjectSlogan("감이 아니라 근거로 실험하세요.");
      setResponseName("Yield");
      setProjectGoal("maximize");
      setFactors(defaultFactors);
      setFactorErrors({});
      setIsIntroComplete(false);
      setIsSetupStarted(false);
      setDesignRuns([]);
      setYields({});
      setYieldErrors({});
      setReport(null);
      setResultHistory([]);
      setExpandedHistoryRuns({});
      setProjectList([]);
      setSurfaceData(null);
      setStatusText("Logged out.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Logout failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function updateFactor(index: number, field: keyof FactorInput, value: string) {
    const factorIdx = factors[index]?.idx;
    if (factorIdx) {
      setFactorErrors((current) => ({
        ...current,
        [factorIdx]: {
          ...(current[factorIdx] ?? {}),
          [field]: undefined,
        },
      }));
    }
    setFactors((current) =>
      current.map((factor, itemIndex) => {
        if (itemIndex !== index) return factor;
        if (field === "factor_type" && value === "categorical") {
          return {
            ...factor,
            factor_type: "categorical",
            ...defaultCategoricalFields(factor.idx),
            unit: "",
            low: "",
            high: "",
          };
        }
        if (field === "factor_type" && value === "continuous") {
          return {
            ...factor,
            factor_type: "continuous",
            ...defaultContinuousFields(factor.idx),
            levels: "",
          };
        }
        return { ...factor, [field]: value };
      }),
    );
  }

  function applyFactorPreset(index: number, presetId: FactorPresetId) {
    if (presetId === "custom") return;
    const factorIdx = factors[index]?.idx;
    if (factorIdx) {
      setFactorErrors((current) => ({
        ...current,
        [factorIdx]: {},
      }));
    }
    setFactors((current) =>
      current.map((factor, itemIndex) =>
        itemIndex === index ? factorFromPreset(factor.idx, presetId) : factor,
      ),
    );
  }

  function applyDefaultContinuousFactors() {
    setFactors(defaultFactors);
    setFactorErrors({});
    setIncludeCenterPoints(false);
    setSurfaceData(null);
  }

  function applyMixedExampleFactors() {
    setFactors([
      factorFromPreset(1, "temperature"),
      factorFromPreset(2, "time"),
      factorFromPreset(3, "solvent"),
      factorFromPreset(4, "base"),
    ]);
    setFactorErrors({});
    setIncludeCenterPoints(false);
    setSurfaceData(null);
  }

  function focusNextYieldInput(
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
  ) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    yieldInputRefs.current[index + 1]?.focus();
  }

  function updateYield(runOrder: number, value: string) {
    setYields((current) => ({
      ...current,
      [runOrder]: value,
    }));
    setYieldErrors((current) => ({
      ...current,
      [runOrder]: validateYieldInput(value),
    }));
  }

  function validateAllYields() {
    const nextErrors: YieldErrors = {};
    for (const run of designRuns) {
      const message = validateYieldInput(yields[run.run_order] ?? "");
      if (message) {
        nextErrors[run.run_order] = message;
      }
    }
    setYieldErrors(nextErrors);
    return nextErrors;
  }

  function toggleRunHistory(runOrder: number) {
    setExpandedHistoryRuns((current) => ({
      ...current,
      [runOrder]: !current[runOrder],
    }));
  }

  async function handleGenerateDesign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationResult = validateFactorsForSubmit(factors);
    setFactorErrors(validationResult.errors);
    if (validationResult.message) {
      setErrorText(validationResult.message);
      setStatusText("");
      return;
    }

    setIsBusy(true);
    setErrorText("");
    setFactorErrors({});
    setStatusText("");
    setReport(null);
    setResultHistory([]);
    setExpandedHistoryRuns({});
    setSurfaceData(null);
    setSurfaceMessage("결과를 입력한 뒤 Update Surface를 눌러 contour plot을 생성하세요.");

    try {
      const createdProject = await apiRequest<Project>("/api/projects/", {
        method: "POST",
        body: JSON.stringify({
          name: projectName,
          description: "",
          slogan: projectSlogan,
          response_name: responseName,
          goal: projectGoal,
          include_center_points: includeCenterPoints && hasContinuousFactor,
          run_budget: includeCenterPoints && hasContinuousFactor ? 11 : 8,
          factors: factors.map(serializeFactorInput),
        }),
      });
      const design = await apiRequest<DesignRun[]>(
        `/api/projects/${createdProject.id}/design/`,
        {
          method: "POST",
          body: JSON.stringify({
            include_center_points: includeCenterPoints && hasContinuousFactor,
          }),
        },
      );

      setProject(createdProject);
      setDesignRuns(design);
      setYields({});
      setYieldErrors({});
      setResultHistory([]);
      setExpandedHistoryRuns({});
      const availableSurfaceFactors = continuousFactors(factors);
      setSurfaceXFactor(factorDisplayName(availableSurfaceFactors[0] ?? factors[0]));
      setSurfaceYFactor(
        factorDisplayName(availableSurfaceFactors[1] ?? availableSurfaceFactors[0] ?? factors[1]),
      );
      setStatusText(`Project ${createdProject.id} design generated.`);
      void loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to generate design.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUpdateProject() {
    if (!project) return;
    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      const updatedProject = await apiRequest<Project>(`/api/projects/${project.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          name: projectName,
          slogan: projectSlogan,
          response_name: responseName,
          goal: projectGoal,
          include_center_points: includeCenterPoints && hasContinuousFactor,
          run_budget: includeCenterPoints && hasContinuousFactor ? 11 : 8,
        }),
      });

      setProject(updatedProject);
      setStatusText(`Project ${updatedProject.id} updated.`);
      void loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to update project.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDuplicateProject() {
    if (!project) return;
    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      const duplicated = await apiRequest<DuplicateProjectResponse>(
        `/api/projects/${project.id}/duplicate/`,
        { method: "POST" },
      );
      await loadProjects();
      await handleLoadProject(duplicated.project_id);
      setStatusText(`Project ${duplicated.project_id} duplicated.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to duplicate project.");
    } finally {
      setIsBusy(false);
    }
  }

  function resetProjectState() {
    setProject(null);
    setProjectName("Suzuki coupling optimization");
    setProjectSlogan("감이 아니라 근거로 실험하세요.");
    setResponseName("Yield");
    setProjectGoal("maximize");
    setFactors(defaultFactors);
    setFactorErrors({});
    setIsIntroComplete(false);
    setIsSetupStarted(false);
    setDesignRuns([]);
    setYields({});
    setYieldErrors({});
    setReport(null);
    setResultHistory([]);
    setExpandedHistoryRuns({});
    setSurfaceData(null);
    setSurfaceMessage("Update Surface를 눌러 contour plot을 생성하세요.");
  }

  async function handleDeleteProjectById(projectId: number, projectTitle: string) {
    const shouldDelete = window.confirm(
      `Delete project "${projectTitle}"? This will also delete factors, design runs, and results.`,
    );
    if (!shouldDelete) return;

    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      await apiRequest<{ project_id: number; deleted: boolean }>(
        `/api/projects/${projectId}/`,
        { method: "DELETE" },
      );
      if (project?.id === projectId) {
        resetProjectState();
      }
      setStatusText("Project deleted.");
      await loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to delete project.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteProject() {
    if (!project) return;
    await handleDeleteProjectById(project.id, project.name);
  }

  async function handleSubmitResults() {
    if (!project) return;
    const nextYieldErrors = validateAllYields();
    if (Object.keys(nextYieldErrors).length > 0) {
      setErrorText("수율 입력값을 확인해주세요. 표시된 위치의 안내에 맞게 수정하면 됩니다.");
      setStatusText("");
      return;
    }

    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      const filledRuns = designRuns.filter((run) => yields[run.run_order]?.trim());
      if (filledRuns.length === 0) {
        throw new Error("Enter at least one yield value.");
      }

      for (const run of filledRuns) {
        await apiRequest(`/api/projects/${project.id}/results/`, {
          method: "POST",
          body: JSON.stringify({
            run_order: run.run_order,
            response: yields[run.run_order],
          }),
        });
      }

      const nextReport = await apiRequest<Report>(`/api/projects/${project.id}/report/`);
      setReport(nextReport);
      setResultHistory(await loadResultHistory(project.id));
      setSurfaceData(null);
      setSurfaceMessage("Update Surface를 눌러 contour plot을 생성하세요.");
      setStatusText(`${filledRuns.length} result(s) submitted.`);
      void loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to submit results.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRefreshReport() {
    if (!project) return;
    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      setReport(await apiRequest<Report>(`/api/projects/${project.id}/report/`));
      setStatusText("Report refreshed.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to refresh report.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDownloadCsv() {
    if (!project) return;
    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${project.id}/design.csv/`,
        {
          credentials: "include",
          mode: "cors",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        let message = "CSV download failed.";
        const contentType = response.headers.get("Content-Type") ?? "";
        if (contentType.includes("application/json")) {
          const body = (await response.json()) as Partial<ApiResponse<null>>;
          message = body.message || message;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `coreacta-doe-design-project-${project.id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setStatusText("CSV downloaded.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "CSV download failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDownloadPdf() {
    if (!project) return;
    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${project.id}/report.pdf/`,
        {
          credentials: "include",
          mode: "cors",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(`PDF download failed. HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `coreacta-doe-report-project-${project.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setStatusText("PDF report downloaded.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "PDF download failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function loadProjects() {
    setIsLoadingProjects(true);
    try {
      setProjectList(await apiRequest<ProjectListItem[]>("/api/projects/"));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to load projects.");
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function loadResultHistory(projectId: number) {
    return apiRequest<ResultHistoryRecord[]>(`/api/projects/${projectId}/result-history/`);
  }

  async function handleLoadProject(projectId: number) {
    setIsBusy(true);
    setErrorText("");
    setStatusText("");

    try {
      const detail = await apiRequest<ProjectDetail>(`/api/projects/${projectId}/`);
      const restoredYields: Record<number, string> = {};

      for (const result of detail.results) {
        restoredYields[result.run_order] = result.response;
      }
      for (const run of detail.design_runs) {
        if (run.result && !restoredYields[run.run_order]) {
          restoredYields[run.run_order] = run.result.response;
        }
      }

      setProject(detail.project);
      setProjectName(detail.project.name);
      setProjectSlogan(detail.project.slogan || "감이 아니라 근거로 실험하세요.");
      setResponseName(detail.project.response_name || "Yield");
      setProjectGoal(normalizeGoal(detail.project.goal));
      setIncludeCenterPoints(Boolean(detail.project.include_center_points));
      const restoredFactors = detail.factors.map((factor) => ({
          idx: factor.idx,
          factor_type: factor.factor_type,
          name_kr: factor.name_kr,
          name_en: factor.name_en,
          unit: factor.unit,
          low: factor.low === null ? "" : String(factor.low),
          high: factor.high === null ? "" : String(factor.high),
          levels: factor.levels.join(", "),
        }));
      setFactors(restoredFactors);
      setFactorErrors({});
      setIsIntroComplete(true);
      setIsSetupStarted(true);
      const availableSurfaceFactors = continuousFactors(restoredFactors);
      setSurfaceXFactor(factorDisplayName(availableSurfaceFactors[0] ?? restoredFactors[0]));
      setSurfaceYFactor(
        factorDisplayName(
          availableSurfaceFactors[1] ?? availableSurfaceFactors[0] ?? restoredFactors[1],
        ),
      );
      setDesignRuns(detail.design_runs);
      setYields(restoredYields);
      setYieldErrors({});
      setReport(await apiRequest<Report>(`/api/projects/${projectId}/report/`));
      setResultHistory(await loadResultHistory(projectId));
      setExpandedHistoryRuns({});
      setSurfaceData(null);
      setSurfaceMessage(
        Object.keys(restoredYields).length > 0
          ? "Update Surface를 눌러 contour plot을 생성하세요."
          : "결과를 입력한 뒤 Update Surface를 눌러 contour plot을 생성하세요.",
      );
      setStatusText(`Project ${projectId} loaded.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to load project.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLoadSurface() {
    if (!project) {
      setSurfaceData(null);
      setSurfaceMessage("먼저 프로젝트를 생성하거나 목록에서 불러오세요.");
      return;
    }

    if (surfaceFactorOptions.length < 2) {
      setSurfaceData(null);
      setSurfaceMessage("Contour plot requires at least two continuous factors.");
      return;
    }

    if (surfaceXFactor === surfaceYFactor) {
      setSurfaceData(null);
      setSurfaceMessage("서로 다른 X/Y factor를 선택해주세요.");
      return;
    }

    setIsBusy(true);
    setErrorText("");
    setStatusText("");
    setSurfaceMessage("Contour plot을 계산하는 중입니다.");

    try {
      const params = new URLSearchParams({
        x_factor: surfaceXFactor,
        y_factor: surfaceYFactor,
      });
      setSurfaceData(
        await apiRequest<SurfaceData>(`/api/projects/${project.id}/surface/?${params}`),
      );
      setSurfaceMessage("");
      setStatusText("Contour plot updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load surface data.";
      setSurfaceData(null);
      setSurfaceMessage(message);
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span>Reaction Optimization</span>
          <h1>Coreacta DOE</h1>
          <p>감이 아니라 근거로 실험하세요.</p>
        </div>
        <div className="hero-meta">
          {currentUser ? (
            <>
              <span>Signed in</span>
              <strong>{currentUser.username}</strong>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleLogout()}
                disabled={isBusy}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <span>API</span>
              <strong>{API_BASE_URL}</strong>
            </>
          )}
        </div>
      </section>

      {!isAuthChecked && (
        <section className="card auth-card">
          <p className="empty-state">Checking login status...</p>
        </section>
      )}

      {isAuthChecked && !currentUser && (
        <>
          {(errorText || statusText) && (
            <div className={errorText ? "notice error" : "notice"}>
              {errorText || statusText}
            </div>
          )}
          <form className="card auth-card" onSubmit={handleLogin}>
            <div className="card-heading">
              <div>
                <span>Login</span>
                <h2>Sign in to Coreacta DOE</h2>
              </div>
              <button type="submit" disabled={isBusy}>
                {isBusy ? "Signing in..." : "Login"}
              </button>
            </div>
            <label className="field">
              <span>Username</span>
              <input
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          </form>
        </>
      )}

      {currentUser && (
        <>
      {isSetupStarted && (
      <section className="card project-list-card">
        <div className="card-heading">
          <div>
            <span>Project List</span>
            <h2>Saved DOE projects</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadProjects()}
            disabled={isLoadingProjects}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {projectList.length === 0 ? (
          <p className="empty-state">No saved projects yet.</p>
        ) : (
          <div className="project-list">
            {projectList.map((item) => (
              <article
                className={project?.id === item.project_id ? "project-item active" : "project-item"}
                key={item.project_id}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>Project {item.project_id}</small>
                </span>
                <em>{item.factor_count} factors</em>
                <em>{item.result_count}/{item.run_budget} {item.response_name}</em>
                <div className="project-actions">
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => void handleLoadProject(item.project_id)}
                    disabled={isBusy}
                  >
                    Open/Edit
                  </button>
                  <button
                    className="danger-button compact-button"
                    type="button"
                    onClick={() => void handleDeleteProjectById(item.project_id, item.name)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      )}

      {isSetupStarted && (errorText || statusText) && (
        <div className={errorText ? "notice error" : "notice"}>
          {errorText || statusText}
        </div>
      )}

      {!isIntroComplete && (
        <section className="card setup-start-card">
          <div className="card-heading">
            <div>
              <span>Start</span>
              <h2>실험 조건을 조금 더 똑똑하게 고르는 방법입니다</h2>
            </div>
          </div>

          <div className="guide-intro">
            <p>
              Coreacta는 연구자가 바꿔볼 조건을 고르면, 먼저 해볼 8개의 실험
              조건표를 자동으로 만듭니다. 모든 조합을 다 해보기 전에 어떤 조건이
              결과에 큰 영향을 주는지 빠르게 확인하기 위한 시작점입니다.
            </p>
          </div>

          <div className="guide-note">
            <strong>첫 단계에서 할 일</strong>
            <p>
              온도, 시간, 용매처럼 결과에 영향을 줄 것 같은 조건 4개를 고릅니다.
              자세한 값은 다음 화면에서 하나씩 입력합니다.
            </p>
          </div>

          <div className="setup-start-footer">
            <p>설명을 확인했으면, 먼저 바꿔볼 조건을 선택합니다.</p>
            <button type="button" onClick={() => setIsIntroComplete(true)}>
              시작하기
            </button>
          </div>
        </section>
      )}

      {isIntroComplete && !isSetupStarted && (
        <section className="card setup-start-card">
          <div className="card-heading">
            <div>
              <span>Step 1</span>
              <h2>바꿔볼 조건 4개를 골라주세요</h2>
            </div>
          </div>

          <div className="section-label">
            <strong>어떤 조건을 바꿔볼까요?</strong>
            <span>잘 모르겠다면 기본값 그대로 두고 다음 단계로 넘어가도 됩니다.</span>
          </div>

          <div className="factor-picker-list">
            {factors.map((factor, index) => (
              <label className="field" key={factor.idx}>
                <span>
                  {index + 1}번째 변수
                </span>
                <select
                  value={factorPresetId(factor)}
                  onChange={(event) =>
                    applyFactorPreset(index, event.target.value as FactorPresetId)
                  }
                >
                  {factorPresetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} · {option.description}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="setup-start-footer">
            <p>
              현재 선택: 범위 조건 {factors.length - categoricalFactorCount}개,
              후보 조건 {categoricalFactorCount}개
            </p>
            <button type="button" onClick={() => setIsSetupStarted(true)}>
              다음: 값 입력
            </button>
          </div>
        </section>
      )}

      {isSetupStarted && (
      <form className="card setup-card" onSubmit={handleGenerateDesign}>
        <div className="card-heading">
          <div>
            <span>Project Setup</span>
            <h2>Reaction and factors</h2>
          </div>
          <div className="button-group">
            {project && (
              <>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleUpdateProject()}
                  disabled={isBusy}
                >
                  <Save size={16} />
                  Save Project
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleDuplicateProject()}
                  disabled={isBusy}
                >
                  <Copy size={16} />
                  Duplicate
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void handleDeleteProject()}
                  disabled={isBusy}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </>
            )}
            <button type="submit" disabled={isBusy}>
              <Play size={16} />
              {isBusy ? "Working..." : "Generate Design"}
            </button>
          </div>
        </div>

        <label className="field project-name">
          <span>Project name</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            required
          />
        </label>

        <div className="project-meta-grid">
          <label className="field">
            <span>Slogan</span>
            <input
              value={projectSlogan}
              onChange={(event) => setProjectSlogan(event.target.value)}
              placeholder="감이 아니라 근거로 실험하세요."
            />
          </label>
          <label className="field">
            <span>Response name</span>
            <input
              value={responseName}
              onChange={(event) => setResponseName(event.target.value)}
              placeholder="Yield"
            />
          </label>
          <label className="field">
            <span>Goal</span>
            <select
              value={projectGoal}
              onChange={(event) => setProjectGoal(normalizeGoal(event.target.value))}
            >
              <option value="maximize">maximize</option>
              <option value="minimize">minimize</option>
            </select>
          </label>
        </div>

        <label className="center-option">
          <input
            type="checkbox"
            checked={includeCenterPoints && hasContinuousFactor}
            onChange={(event) => setIncludeCenterPoints(event.target.checked)}
            disabled={!hasContinuousFactor}
          />
          <span className="label-with-help">
            Center point 3회 추가
            <HelpTip label="Center point 설명">
              모든 범위 조건을 중간값으로 맞춘 확인 실험입니다. 예를 들어 온도 60-90 °C라면 75 °C 조건을 반복해, 결과가 직선적인 경향인지 휘어진 경향인지 확인합니다.
            </HelpTip>
          </span>
        </label>

        <div className="factor-question">
          <div>
            <span>1. 설정할 변수를 먼저 선택하세요</span>
            <p>
              각 슬롯에서 변수 템플릿을 고르면 type과 입력칸이 자동으로 바뀝니다.
              직접 수정이 필요하면 Custom 상태에서 아래 값을 편집하세요.
            </p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={applyDefaultContinuousFactors}
            disabled={isBusy}
          >
            기본 continuous 4개로 초기화
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setIsSetupStarted(false)}
            disabled={isBusy}
          >
            변수 선택으로 돌아가기
          </button>
        </div>

        <div className="factor-grid">
          <span>Factor</span>
          <span>variable</span>
          <span>type</span>
          <span>name_kr</span>
          <span>name_en</span>
          <span>unit</span>
          <span>low</span>
          <span>high</span>
          <span>levels</span>
          {factors.map((factor, index) => {
            const errors = factorErrors[factor.idx] ?? {};
            return (
              <div className="factor-row" key={factor.idx}>
                <strong>{factorKeys[index]}</strong>
                <div className="factor-cell">
                  <select
                    value={factorPresetId(factor)}
                    onChange={(event) =>
                      applyFactorPreset(index, event.target.value as FactorPresetId)
                    }
                  >
                    {availableFactorPresetOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="factor-cell">
                  <select
                    value={factor.factor_type}
                    onChange={(event) =>
                      updateFactor(index, "factor_type", event.target.value)
                    }
                  >
                    <option value="continuous">Continuous</option>
                    {!isRangeOnlySetup && <option value="categorical">Categorical</option>}
                  </select>
                </div>
                <div className="factor-cell">
                  <input
                    className={errors.name_kr ? "invalid-input" : ""}
                    value={factor.name_kr}
                    onChange={(event) => updateFactor(index, "name_kr", event.target.value)}
                    aria-invalid={Boolean(errors.name_kr)}
                    required
                  />
                  {errors.name_kr && <small className="field-error">{errors.name_kr}</small>}
                </div>
                <div className="factor-cell">
                  <input
                    className={errors.name_en ? "invalid-input" : ""}
                    value={factor.name_en}
                    onChange={(event) => updateFactor(index, "name_en", event.target.value)}
                    aria-invalid={Boolean(errors.name_en)}
                    required
                  />
                  {errors.name_en && <small className="field-error">{errors.name_en}</small>}
                </div>
                {factor.factor_type === "continuous" ? (
                  <>
                    <div className="factor-cell">
                      <input
                        className={errors.unit ? "invalid-input" : ""}
                        value={factor.unit}
                        onChange={(event) => updateFactor(index, "unit", event.target.value)}
                        aria-invalid={Boolean(errors.unit)}
                        required
                      />
                      {errors.unit && <small className="field-error">{errors.unit}</small>}
                    </div>
                    <div className="factor-cell">
                      <input
                        className={errors.low ? "numeric-input invalid-input" : "numeric-input"}
                        value={factor.low}
                        onChange={(event) => updateFactor(index, "low", event.target.value)}
                        aria-invalid={Boolean(errors.low)}
                        required
                      />
                      {errors.low && <small className="field-error">{errors.low}</small>}
                    </div>
                    <div className="factor-cell">
                      <input
                        className={errors.high ? "numeric-input invalid-input" : "numeric-input"}
                        value={factor.high}
                        onChange={(event) => updateFactor(index, "high", event.target.value)}
                        aria-invalid={Boolean(errors.high)}
                        required
                      />
                      {errors.high && <small className="field-error">{errors.high}</small>}
                    </div>
                    <div className="factor-cell">
                      <span className="factor-placeholder">-</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="factor-cell">
                      <span className="factor-placeholder">-</span>
                    </div>
                    <div className="factor-cell">
                      <span className="factor-placeholder">-</span>
                    </div>
                    <div className="factor-cell">
                      <span className="factor-placeholder">-</span>
                    </div>
                    <div className="factor-cell">
                      <input
                        className={errors.levels ? "invalid-input" : ""}
                        value={factor.levels}
                        onChange={(event) => updateFactor(index, "levels", event.target.value)}
                        placeholder="THF, Toluene"
                        aria-invalid={Boolean(errors.levels)}
                        required
                      />
                      {errors.levels && <small className="field-error">{errors.levels}</small>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </form>
      )}

      {isSetupStarted && (
      <>
      <section className="card">
        <div className="card-heading">
          <div>
            <span>Design Table</span>
            <h2>{project ? `${project.name} · Project ${project.id}` : "No design yet"}</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={handleDownloadCsv}
            disabled={!project || isBusy}
          >
            <Download size={16} />
            CSV 다운로드
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                {factors.map((factor) => (
                  <th key={factor.idx}>
                    {factor.name_kr}({factor.name_en}, {factor.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {designRuns.length === 0 ? (
                <tr>
                  <td colSpan={5}>Generate a design to view 8 runs.</td>
                </tr>
              ) : (
                designRuns.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span className="run-badge">Run {run.run_order}</span>
                    </td>
                    {factorKeys.map((factorKey) => (
                      <td className="numeric-cell" key={factorKey}>
                        {formatFactorValue(run, factorKey)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-heading">
          <div>
            <span>Results Input</span>
            <h2>Yield by run</h2>
          </div>
          <div className="button-group">
            <button
              type="button"
              onClick={handleSubmitResults}
              disabled={!project || designRuns.length === 0 || isBusy}
            >
              <Send size={16} />
              Submit Results
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleRefreshReport}
              disabled={!project || isBusy}
            >
              <RefreshCw size={16} />
              Refresh Report
            </button>
          </div>
        </div>

        <div className="table-wrap compact-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>수율(Yield, %)</th>
              </tr>
            </thead>
            <tbody>
              {designRuns.length === 0 ? (
                <tr>
                  <td colSpan={2}>Generate a design before entering results.</td>
                </tr>
              ) : (
                designRuns.map((run, index) => (
                  <tr key={run.id}>
                    <td>
                      <span className="run-badge">Run {run.run_order}</span>
                    </td>
                    <td>
                      <div className="result-cell">
                        <input
                          ref={(element) => {
                            yieldInputRefs.current[index] = element;
                          }}
                          className={
                            yieldErrors[run.run_order]
                              ? "yield-input numeric-input invalid-input"
                              : "yield-input numeric-input"
                          }
                          inputMode="decimal"
                          value={yields[run.run_order] ?? ""}
                          onChange={(event) => updateYield(run.run_order, event.target.value)}
                          onKeyDown={(event) => focusNextYieldInput(event, index)}
                          aria-invalid={Boolean(yieldErrors[run.run_order])}
                          placeholder="예: 61.5"
                        />
                        {yieldErrors[run.run_order] && (
                          <small className="field-error">{yieldErrors[run.run_order]}</small>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {designRuns.length > 0 && (
          <div className="history-panel">
            {designRuns.map((run) => {
              const runHistory = historyByRun[run.run_order] ?? [];
              const isExpanded = Boolean(expandedHistoryRuns[run.run_order]);
              return (
                <div className="history-run" key={run.id}>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => toggleRunHistory(run.run_order)}
                  >
                    Run {run.run_order} History {runHistory.length}
                  </button>
                  {isExpanded && (
                    <div className="history-list">
                      {runHistory.length === 0 ? (
                        <p className="empty-state">수정 이력이 없습니다.</p>
                      ) : (
                        runHistory.map((item) => (
                          <div className="history-item" key={item.id}>
                            <strong>{item.old_y} -&gt; {item.new_y}</strong>
                            <span>{item.changed_by}</span>
                            <time>{new Date(item.changed_at).toLocaleString()}</time>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card report-card">
        <div className="card-heading">
          <div>
            <span>Report</span>
            <h2>Top drivers and recommended next runs</h2>
          </div>
          <div className="report-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={handleDownloadPdf}
              disabled={!project || isBusy}
            >
              <FileText size={16} />
              PDF 리포트 다운로드
            </button>
            <FlaskConical className="report-icon" size={24} />
          </div>
        </div>

        {!report ? (
          <p className="empty-state">Submit results to calculate the report.</p>
        ) : (
          <div className="report-layout">
            <div>
              <h3>Top Drivers</h3>
              <div className="driver-grid">
                {report.top_drivers.map((effect, index) => (
                  <article className="driver-card" key={effect.factor_key}>
                    <span>#{index + 1}</span>
                    <strong>{effect.display_name}</strong>
                    <div>
                      <b>Impact {formatImpact(effect)}</b>
                      <em>{effect.direction_label || `${effect.direction} 유리`}</em>
                      <small>Signed effect: {formatEffect(effect.effect)}</small>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <h3>Notes</h3>
              <div className="notes-box">
                {report.message ||
                  "Impact는 effect의 절댓값입니다. Signed effect는 HIGH 평균 수율 - LOW 평균 수율이며, 음수이면 LOW 조건이 유리하다는 뜻입니다."}
              </div>
            </div>

            <div className="advisor-card">
              <h3>AI Experiment Advisor</h3>
              {report.interpretation.length === 0 ? (
                <p className="empty-state">해석을 생성할 데이터가 충분하지 않습니다.</p>
              ) : (
                <ul>
                  {report.interpretation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="stats-card">
              <h3 className="heading-with-help">
                Curvature
                <HelpTip label="Curvature 설명">
                  조건을 조금씩 바꿀 때 결과가 직선처럼 변하는지, 어느 지점부터 꺾이거나 휘어지는지 보는 신호입니다. Center point 결과가 있으면 더 잘 판단할 수 있습니다.
                </HelpTip>
              </h3>
              <p>{report.curvature.message}</p>
              {report.curvature.available && (
                <div className="stats-grid">
                  <span>Factorial mean: {report.curvature.factorial_mean?.toFixed(2)}%</span>
                  <span>Center mean: {report.curvature.center_mean?.toFixed(2)}%</span>
                  <span>Curvature effect: {report.curvature.effect?.toFixed(2)}</span>
                  <span>{report.curvature.has_curvature ? "Curvature 가능성 있음" : "뚜렷한 curvature 없음"}</span>
                </div>
              )}
            </div>

            <div className="anova-card">
              <h3 className="heading-with-help">
                ANOVA
                <HelpTip label="ANOVA 설명">
                  각 조건이 결과 차이에 얼마나 의미 있게 기여했는지 보는 간단한 통계 요약입니다. p-value가 작을수록 우연보다는 실제 영향일 가능성이 높다고 해석합니다.
                </HelpTip>
              </h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Factor</th>
                      <th>Effect</th>
                      <th>p-value</th>
                      <th>Significance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.anova.map((row) => (
                      <tr key={row.factor_key}>
                        <td>{row.factor}</td>
                        <td className="numeric-cell">{formatEffect(row.effect)}</td>
                        <td className="numeric-cell">
                          {row.p_value === null ? "-" : row.p_value.toFixed(4)}
                        </td>
                        <td>{row.significant ? "Significant" : "Not significant"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="recommendations">
              <h3>Recommended Next Runs</h3>
              {report.recommendations.length === 0 ? (
                <p className="empty-state">No recommendation yet.</p>
              ) : (
                report.recommendations.map((recommendation) => (
                  <article className="recommendation" key={recommendation.rank}>
                    <div className="recommendation-title">
                      <span>#{recommendation.rank}</span>
                      <strong>{recommendation.strategy}</strong>
                    </div>
                    {recommendation.predicted_yield !== undefined &&
                      recommendation.predicted_yield !== null && (
                        <p className="prediction">
                          Predicted yield: {Number(recommendation.predicted_yield).toFixed(1)}%
                        </p>
                      )}
                    <div className="condition-grid">
                      {Object.entries(recommendation.conditions).map(([key, condition]) => (
                        <span key={key}>
                          <b>{key}</b>
                          <em>{condition.direction_label || condition.direction}</em>
                          <strong>{formatConditionValue(condition)}</strong>
                        </span>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      <section className="graph-section">
        <article className="card chart-card">
          <div className="card-heading">
            <div>
              <span>Visualization</span>
              <h2 className="heading-with-help">
                Main Effect Analysis
                <HelpTip label="Main Effect Analysis 설명">
                  각 조건을 낮은 값에서 높은 값으로 바꿨을 때 수율이 평균적으로 얼마나 달라졌는지 보여줍니다. 막대가 클수록 영향이 큰 조건입니다.
                </HelpTip>
              </h2>
            </div>
          </div>

          {mainEffectData.length === 0 ? (
            <p className="empty-state">시각화할 데이터가 충분하지 않습니다.</p>
          ) : (
            <>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mainEffectData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="#e6edf1" vertical={false} />
                    <XAxis
                      dataKey="key"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#667586", fontSize: 12, fontWeight: 700 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#667586", fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(15, 118, 110, 0.07)" }}
                      formatter={(value) => [Number(value).toFixed(2), "Effect"]}
                      labelFormatter={(label) => {
                        const item = mainEffectData.find((effect) => effect.key === label);
                        return item ? item.name : label;
                      }}
                    />
                    <ReferenceLine y={0} stroke="#9aa7b3" />
                    <Bar dataKey="effect" radius={[6, 6, 0, 0]}>
                      {mainEffectData.map((item) => (
                        <Cell
                          key={item.key}
                          fill={item.effect >= 0 ? "#0f766e" : "#b42318"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="effect-legend">
                {mainEffectData.map((item) => (
                  <span key={item.key}>
                    <b>{item.key}</b> {item.directionLabel}
                  </span>
                ))}
              </div>
            </>
          )}
        </article>

        <article className="card chart-card">
          <div className="card-heading">
            <div>
              <span>Visualization</span>
              <h2 className="heading-with-help">
                Pareto Chart
                <HelpTip label="Pareto Chart 설명">
                  영향이 큰 조건부터 순서대로 정렬한 그래프입니다. 어떤 조건부터 집중해서 최적화할지 빠르게 고를 때 사용합니다.
                </HelpTip>
              </h2>
            </div>
          </div>

          {paretoData.length === 0 ? (
            <p className="empty-state">시각화할 데이터가 충분하지 않습니다.</p>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paretoData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#e6edf1" vertical={false} />
                  <XAxis
                    dataKey="key"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#667586", fontSize: 12, fontWeight: 700 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#667586", fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(15, 118, 110, 0.07)" }}
                    formatter={(value) => [Number(value).toFixed(2), "|Effect|"]}
                    labelFormatter={(label) => {
                      const item = paretoData.find((effect) => effect.key === label);
                      return item ? item.name : label;
                    }}
                  />
                  <Bar dataKey="effectAbs" fill="#0f766e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="card chart-card">
          <div className="card-heading">
            <div>
              <span>Visualization</span>
              <h2 className="heading-with-help">
                Yield Trend
                <HelpTip label="Yield Trend 설명">
                  Run 번호별 입력한 수율을 선으로 연결한 그래프입니다. 특정 실험에서 결과가 튀는지, 전체 흐름이 어떤지 빠르게 확인합니다.
                </HelpTip>
              </h2>
            </div>
          </div>

          {yieldTrendData.length === 0 ? (
            <p className="empty-state">시각화할 데이터가 충분하지 않습니다.</p>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yieldTrendData} margin={{ top: 8, right: 18, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#e6edf1" vertical={false} />
                  <XAxis
                    dataKey="run"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#667586", fontSize: 12 }}
                    label={{ value: "Run number", position: "insideBottom", offset: -4 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#667586", fontSize: 12 }}
                    label={{ value: "Yield (%)", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(2)}%`, "Yield"]}
                    labelFormatter={(label) => `Run ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="yield"
                    stroke="#0f766e"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#0f766e", strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="card chart-card contour-card">
          <div className="card-heading">
            <div>
              <span>RSM MVP</span>
              <h2 className="heading-with-help">
                Contour Plot
                <HelpTip label="Contour Plot 설명">
                  두 조건을 동시에 바꿨을 때 예상 수율이 어떻게 달라지는지 색으로 보여주는 지도입니다. 진한 영역은 더 높은 수율이 예상되는 조건입니다.
                </HelpTip>
              </h2>
            </div>
            <button
              type="button"
              onClick={handleLoadSurface}
              disabled={
                !project ||
                isBusy ||
                surfaceFactorOptions.length < 2 ||
                surfaceXFactor === surfaceYFactor
              }
            >
              <RefreshCw size={16} />
              Update Surface
            </button>
          </div>

          <div className="surface-controls">
            <label>
              <span>X factor</span>
              <select
                value={surfaceXFactor}
                onChange={(event) => {
                  setSurfaceXFactor(event.target.value);
                  setSurfaceData(null);
                  setSurfaceMessage("Update Surface를 눌러 contour plot을 생성하세요.");
                }}
              >
                {surfaceFactorOptions.map((factor) => (
                  <option key={factor.idx} value={factorDisplayName(factor)}>
                    {factorDisplayName(factor)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Y factor</span>
              <select
                value={surfaceYFactor}
                onChange={(event) => {
                  setSurfaceYFactor(event.target.value);
                  setSurfaceData(null);
                  setSurfaceMessage("Update Surface를 눌러 contour plot을 생성하세요.");
                }}
              >
                {surfaceFactorOptions.map((factor) => (
                  <option key={factor.idx} value={factorDisplayName(factor)}>
                    {factorDisplayName(factor)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!surfaceData ? (
            <p className="empty-state">{surfaceMessage}</p>
          ) : (
            <div className="surface-layout">
              <div className="surface-y-label">{surfaceData.y_factor}</div>
              <div className="surface-plot">
                {[...surfaceData.z_matrix].reverse().map((row, rowIndex) =>
                  row.map((value, columnIndex) => (
                    <span
                      className="surface-cell"
                      key={`${rowIndex}-${columnIndex}`}
                      style={{
                        background: heatColor(value, surfaceScale.min, surfaceScale.max),
                      }}
                      title={`${surfaceData.x_factor}: ${surfaceData.x_values[columnIndex].toFixed(2)}, ${surfaceData.y_factor}: ${surfaceData.y_values[surfaceData.y_values.length - 1 - rowIndex].toFixed(2)}, predicted yield: ${value.toFixed(2)}`}
                    />
                  )),
                )}
              </div>
              <div className="surface-x-label">{surfaceData.x_factor}</div>
              <div className="surface-scale">
                <span>{surfaceScale.min.toFixed(2)}</span>
                <div />
                <span>{surfaceScale.max.toFixed(2)}</span>
              </div>
              <p className="surface-note">
                Predicted yield by {surfaceData.model}
              </p>
            </div>
          )}
        </article>
      </section>
      </>
      )}
        </>
      )}
    </main>
  );
}
