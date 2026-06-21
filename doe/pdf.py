import os
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .services import build_report


FONT_NAME = "CoreactaKorean"
FONT_PATHS = [
    Path(path)
    for path in (
        os.getenv("COREACTA_PDF_FONT"),
        "C:/Windows/Fonts/malgun.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    )
    if path
]


def build_project_report_pdf(project):
    register_korean_font()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Coreacta DOE Report - Project {project.id}",
    )
    styles = build_styles()
    story = []
    report = build_report(project)
    factors = list(project.factors.order_by("idx"))
    runs = list(project.design_runs.select_related("result").order_by("run_order"))

    story.append(Paragraph("Coreacta DOE Report", styles["Title"]))
    story.append(Paragraph(project.name, styles["Subtitle"]))
    story.append(Paragraph("감이 아니라 근거로 실험하세요.", styles["Body"]))
    story.append(Paragraph("Response: 수율(Yield, %)", styles["Body"]))
    story.append(Spacer(1, 8))

    story.append(section_title("Factors", styles))
    story.append(
        basic_table(
            [["#", "Factor", "Type", "Low / Levels", "High"]]
            + [factor_summary_row(factor) for factor in factors]
        )
    )
    story.append(Spacer(1, 8))

    story.append(section_title("8-run Design and Results", styles))
    design_header = ["Run", *[factor.display_name for factor in factors], "수율(Yield, %)"]
    design_rows = []
    for run in runs:
        design_rows.append(
            [
                run.run_order,
                *[run.values.get(factor.key, "") for factor in factors],
                run.result.response if hasattr(run, "result") else "",
            ]
        )
    story.append(basic_table([design_header] + design_rows, repeat_rows=1))
    story.append(Spacer(1, 8))

    story.append(section_title("Top Drivers", styles))
    top_driver_rows = [
        ["Factor", "Impact", "Signed Effect", "Preferred Level"]
    ]
    for effect in report["top_drivers"]:
        top_driver_rows.append(
            [
                effect["display_name"],
                format_number(effect.get("effect_abs")),
                format_number(effect["effect"]),
                effect.get("direction_label") or effect["direction"],
            ]
        )
    story.append(basic_table(top_driver_rows))
    story.append(Spacer(1, 8))

    story.append(section_title("Curvature", styles))
    curvature = report["curvature"]
    story.append(Paragraph(curvature["message"], styles["Body"]))
    if curvature["available"]:
        story.append(
            basic_table(
                [
                    ["Factorial Mean", "Center Mean", "Curvature Effect", "Status"],
                    [
                        format_number(curvature["factorial_mean"]),
                        format_number(curvature["center_mean"]),
                        format_number(curvature["effect"]),
                        "Possible curvature" if curvature["has_curvature"] else "No clear curvature",
                    ],
                ]
            )
        )
    story.append(Spacer(1, 8))

    story.append(section_title("ANOVA", styles))
    anova_rows = [["Factor", "Effect", "p-value", "Significance"]]
    for row in report["anova"]:
        anova_rows.append(
            [
                row["factor"],
                format_number(row["effect"]),
                format_number(row["p_value"]),
                "Significant" if row["significant"] else "Not significant",
            ]
        )
    story.append(basic_table(anova_rows, repeat_rows=1))
    story.append(Spacer(1, 8))

    story.append(section_title("Notes", styles))
    story.append(
        Paragraph(
            report["message"]
            or (
                "Impact is the absolute size of the main effect. Signed Effect is "
                "mean(Y | HIGH) - mean(Y | LOW). A negative signed effect means "
                "the LOW level is expected to give a higher response."
            ),
            styles["Body"],
        )
    )
    story.append(Spacer(1, 8))

    story.append(section_title("AI Experiment Advisor", styles))
    for item in report.get("interpretation", []):
        story.append(Paragraph(f"• {item}", styles["Body"]))
    story.append(Spacer(1, 8))

    story.append(section_title("Recommended Next Runs", styles))
    if report["recommendations"]:
        recommendation_rows = [["Rank", "Strategy", "Predicted Yield", "Conditions"]]
        for recommendation in report["recommendations"]:
            conditions = ", ".join(
                format_condition(key, condition)
                for key, condition in recommendation["conditions"].items()
            )
            recommendation_rows.append(
                [
                    recommendation["rank"],
                    recommendation["strategy"],
                    format_predicted_yield(recommendation.get("predicted_yield")),
                    conditions,
                ]
            )
        story.append(basic_table(recommendation_rows, repeat_rows=1))
    else:
        story.append(Paragraph("추천 조건을 생성할 만큼 데이터가 충분하지 않습니다.", styles["Body"]))

    doc.build(story)
    return buffer.getvalue()


def korean_font_path():
    return next((path for path in FONT_PATHS if path.exists()), None)


def register_korean_font():
    font_path = korean_font_path()
    if font_path and FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_NAME, str(font_path)))


def build_styles():
    styles = getSampleStyleSheet()
    base_font = FONT_NAME if korean_font_path() else "Helvetica"

    return {
        "Title": ParagraphStyle(
            "CoreactaTitle",
            parent=styles["Title"],
            fontName=base_font,
            fontSize=20,
            leading=26,
            spaceAfter=6,
        ),
        "Subtitle": ParagraphStyle(
            "CoreactaSubtitle",
            parent=styles["Heading2"],
            fontName=base_font,
            fontSize=13,
            leading=18,
            textColor=colors.HexColor("#0f766e"),
            spaceAfter=4,
        ),
        "Section": ParagraphStyle(
            "CoreactaSection",
            parent=styles["Heading3"],
            fontName=base_font,
            fontSize=12,
            leading=16,
            spaceBefore=4,
            spaceAfter=4,
        ),
        "Body": ParagraphStyle(
            "CoreactaBody",
            parent=styles["BodyText"],
            fontName=base_font,
            fontSize=9,
            leading=13,
        ),
    }


def section_title(text, styles):
    return Paragraph(text, styles["Section"])


def basic_table(rows, repeat_rows=0):
    table = Table([[cell_text(cell) for cell in row] for row in rows], repeatRows=repeat_rows)
    table.setStyle(
        TableStyle(
            [
                (
                    "FONTNAME",
                    (0, 0),
                    (-1, -1),
                    FONT_NAME if korean_font_path() else "Helvetica",
                ),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e7f4f1")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#115e59")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d9e1e6")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def cell_text(value):
    if value is None:
        return ""
    return str(value)


def format_number(value):
    if value is None:
        return ""
    return f"{float(value):.4g}"


def format_predicted_yield(value):
    if value is None:
        return ""
    return f"{float(value):.1f}%"


def format_condition(key, condition):
    unit = condition.get("unit", "")
    unit_suffix = f" {unit}" if unit else ""
    direction = condition.get("direction_label") or condition["direction"]
    return f"{key}: {direction} ({condition['value']}{unit_suffix})"


def factor_summary_row(factor):
    if factor.is_categorical:
        return [
            factor.idx,
            factor.display_name,
            "Categorical",
            ", ".join(factor.levels or []),
            "",
        ]
    return [factor.idx, factor.display_name, "Continuous", factor.low, factor.high]
