"use client";

import {
  Fragment,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Copy,
  Download,
  FileText,
  Play,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
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
  process.env.NEXT_PUBLIC_API_BASE_URL !== undefined
    ? process.env.NEXT_PUBLIC_API_BASE_URL
    : process.env.NODE_ENV === "production"
      ? ""
      : "http://localhost:8000";

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message: string;
};

const guidedWizardSteps = [
  "조건 1",
  "조건 2",
  "조건 3",
  "조건 4",
  "조건 1 값",
  "조건 2 값",
  "조건 3 값",
  "조건 4 값",
  "측정 결과",
  "목표",
  "프로젝트명",
  "실험표 생성",
];

const WIZARD_LAST_STEP = guidedWizardSteps.length - 1;

const objectiveSuggestions = [
  { label: "수율 높이기", prompt: "수율을 높이고 싶어요" },
  { label: "점도 낮추기", prompt: "점도를 낮추고 싶어요" },
  { label: "휘도 높이기", prompt: "휘도를 높이고 싶어요" },
  { label: "저항 낮추기", prompt: "저항을 낮추고 싶어요" },
];

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
  | "concentration"
  | "speed"
  | "solvent"
  | "material"
  | "equipment_setting"
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

type CsrfResponse = {
  csrfToken: string;
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
    name_kr: "농도",
    name_en: "Concentration",
    unit: "M",
    low: "0.05",
    high: "0.30",
    levels: "",
  },
  {
    idx: 4,
    factor_type: "continuous",
    name_kr: "속도",
    name_en: "Speed",
    unit: "rpm",
    low: "200",
    high: "800",
    levels: "",
  },
];

function hasFactorChangedFromDefault(factor: FactorInput, index: number) {
  const defaultFactor = defaultFactors[index];
  if (!defaultFactor) return true;

  return (
    factor.idx !== defaultFactor.idx ||
    factor.factor_type !== defaultFactor.factor_type ||
    factor.name_kr !== defaultFactor.name_kr ||
    factor.name_en !== defaultFactor.name_en ||
    factor.unit !== defaultFactor.unit ||
    factor.low !== defaultFactor.low ||
    factor.high !== defaultFactor.high ||
    factor.levels !== defaultFactor.levels
  );
}

const initialFactorPresetSelections: Record<number, FactorPresetId> = {
  1: "temperature",
  2: "time",
  3: "concentration",
  4: "speed",
};

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
    description: "숫자 범위형",
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
    description: "숫자 범위형",
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
    id: "concentration",
    label: "농도 / Concentration",
    description: "숫자 범위형",
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
    id: "speed",
    label: "속도 / Speed",
    description: "숫자 범위형",
    example: "예: 200-800 rpm처럼 낮은 값과 높은 값을 정합니다.",
    factor: {
      factor_type: "continuous",
      name_kr: "속도",
      name_en: "Speed",
      unit: "rpm",
      low: "200",
      high: "800",
      levels: "",
    },
  },
  {
    id: "solvent",
    label: "용매 / Solvent",
    description: "선택형",
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
    id: "material",
    label: "재료 / Material",
    description: "선택형",
    example: "예: A와 B처럼 비교할 재료 후보 2개를 고릅니다.",
    factor: {
      factor_type: "categorical",
      name_kr: "재료",
      name_en: "Material",
      unit: "",
      low: "",
      high: "",
      levels: "A, B",
    },
  },
  {
    id: "equipment_setting",
    label: "장비 조건 / Equipment setting",
    description: "선택형",
    example: "예: Low grade와 High grade처럼 장비 조건 후보 2개를 고릅니다.",
    factor: {
      factor_type: "categorical",
      name_kr: "장비 조건",
      name_en: "Equipment setting",
      unit: "",
      low: "",
      high: "",
      levels: "Low grade, High grade",
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

const factorTypeHelpCopy: Record<FactorInput["factor_type"], { title: string; body: string; example: string }> = {
  continuous: {
    title: "숫자 범위형",
    body: "온도, 시간, 농도처럼 숫자로 낮은 값과 높은 값을 정할 수 있는 조건입니다.",
    example: "예: 온도를 60도와 90도에서 비교해요.",
  },
  categorical: {
    title: "선택형",
    body: "용매, 재료, 장비 설정처럼 숫자 범위가 아니라 후보 2개를 비교하는 조건입니다.",
    example: "예: 용매를 THF와 Toluene으로 비교해요.",
  },
};

function presetOptionsForFactorType(factorType: FactorInput["factor_type"]) {
  return factorPresetOptions.filter(
    (option) => option.id === "custom" || option.factor?.factor_type === factorType,
  );
}

function defaultPresetIdForFactorType(idx: number, factorType: FactorInput["factor_type"]): FactorPresetId {
  if (factorType === "categorical") {
    return idx % 2 === 1 ? "solvent" : "material";
  }

  return initialFactorPresetSelections[idx] ?? "custom";
}

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

const conditionNameTranslations: Record<string, string> = {
  온도: "Temperature",
  "반응 온도": "Reaction temperature",
  시간: "Time",
  "반응 시간": "Reaction time",
  농도: "Concentration",
  속도: "Speed",
  용매: "Solvent",
  재료: "Material",
  "장비 조건": "Equipment setting",
  압력: "Pressure",
  습도: "Humidity",
  촉매: "Catalyst",
  교반: "Stirring",
  "교반 속도": "Stirring speed",
  전압: "Voltage",
  전류: "Current",
  전력: "Power",
  유량: "Flow rate",
  비율: "Ratio",
  두께: "Thickness",
  점도: "Viscosity",
  휘도: "Luminance",
  수율: "Yield",
  저항: "Resistance",
  산도: "Acidity",
  염기도: "Basicity",
  밀도: "Density",
  "건조 시간": "Drying time",
  "경화 시간": "Curing time",
  "열처리 온도": "Annealing temperature",
};

const conditionNameKeywordTranslations: Array<{ keyword: string; english: string }> = [
  { keyword: "온도", english: "Temperature" },
  { keyword: "시간", english: "Time" },
  { keyword: "농도", english: "Concentration" },
  { keyword: "속도", english: "Speed" },
  { keyword: "용매", english: "Solvent" },
  { keyword: "재료", english: "Material" },
  { keyword: "압력", english: "Pressure" },
  { keyword: "습도", english: "Humidity" },
  { keyword: "촉매", english: "Catalyst" },
  { keyword: "전압", english: "Voltage" },
  { keyword: "전류", english: "Current" },
  { keyword: "유량", english: "Flow rate" },
  { keyword: "비율", english: "Ratio" },
  { keyword: "두께", english: "Thickness" },
  { keyword: "점도", english: "Viscosity" },
  { keyword: "휘도", english: "Luminance" },
  { keyword: "수율", english: "Yield" },
  { keyword: "저항", english: "Resistance" },
];

function suggestedEnglishNameFromKorean(nameKr: string) {
  const normalized = nameKr.trim().replace(/\s+/g, " ");
  if (!normalized) return "";

  const exact = conditionNameTranslations[normalized];
  if (exact) return exact;

  const matched = conditionNameKeywordTranslations.find(({ keyword }) =>
    normalized.includes(keyword),
  );
  return matched?.english ?? "";
}

function isKnownSuggestedEnglishName(nameEn: string) {
  const normalized = nameEn.trim();
  if (!normalized) return true;

  const knownSuggestions = new Set([
    ...Object.values(conditionNameTranslations),
    ...conditionNameKeywordTranslations.map(({ english }) => english),
    ...factorPresetOptions
      .map((option) => option.factor?.name_en)
      .filter((value): value is string => Boolean(value)),
  ]);

  return knownSuggestions.has(normalized);
}

function getCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length !== 2) return "";
  return parts.pop()?.split(";").shift() ?? "";
}

let csrfTokenCache = "";

async function ensureCsrfToken() {
  const cookieToken = getCookie("csrftoken");
  if (cookieToken) {
    csrfTokenCache = cookieToken;
    return cookieToken;
  }
  if (csrfTokenCache) return csrfTokenCache;

  const response = await fetch(`${API_BASE_URL}/api/auth/csrf/`, {
    credentials: "include",
    mode: "cors",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`CSRF token request failed. HTTP ${response.status}`);
  }

  const body = (await response.json()) as ApiResponse<CsrfResponse>;
  csrfTokenCache = getCookie("csrftoken") || body.data?.csrfToken || "";
  return csrfTokenCache;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = await ensureCsrfToken();
    if (!csrfToken) {
      throw new Error("CSRF token is missing. Please refresh the page and try again.");
    }
    headers["X-CSRFToken"] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    mode: "cors",
    cache: "no-store",
    headers,
  });
  const latestCookieToken = getCookie("csrftoken");
  if (latestCookieToken) {
    csrfTokenCache = latestCookieToken;
  }

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
        addError(factor.idx, "low", "최소값을 입력해주세요.");
      }
      if (!factor.high.trim()) {
        addError(factor.idx, "high", "최대값을 입력해주세요.");
      }
      if (factor.low.trim() && !Number.isFinite(low)) {
        addError(factor.idx, "low", "숫자로 입력해주세요. 예: 60");
      }
      if (factor.high.trim() && !Number.isFinite(high)) {
        addError(factor.idx, "high", "숫자로 입력해주세요. 예: 90");
      }
      if (Number.isFinite(low) && Number.isFinite(high) && low >= high) {
        addError(factor.idx, "low", "최소값은 최대값보다 작아야 합니다.");
        addError(factor.idx, "high", "최대값은 최소값보다 커야 합니다.");
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

function validateConditionSelection(factors: FactorInput[]) {
  const errors: FactorFieldErrors = {};

  for (const factor of factors) {
    if (!factor.name_kr.trim()) {
      errors[factor.idx] = {
        ...(errors[factor.idx] ?? {}),
        name_kr: "조건명을 입력해주세요. 예: 온도",
      };
    }
    if (!factor.name_en.trim()) {
      errors[factor.idx] = {
        ...(errors[factor.idx] ?? {}),
        name_en: "영문명을 입력해주세요. 예: Temperature",
      };
    }
  }

  return {
    errors,
    message: Object.keys(errors).length
      ? "조건 이름을 확인해주세요."
      : "",
  };
}

function continuousFactors(factors: FactorInput[]) {
  return factors.filter((factor) => factor.factor_type === "continuous");
}

function validateSingleCondition(factor: FactorInput) {
  const errors: Partial<Record<keyof FactorInput, string>> = {};
  if (!factor.name_kr.trim()) {
    errors.name_kr = "한글 조건명을 입력해주세요. 예: 온도";
  }
  if (!factor.name_en.trim()) {
    errors.name_en = "영문 조건명을 입력해주세요. 예: Temperature";
  }

  return {
    errors,
    message: Object.keys(errors).length > 0 ? "조건명을 확인해주세요." : "",
  };
}

function validateSingleConditionValue(factor: FactorInput) {
  const errors: Partial<Record<keyof FactorInput, string>> = {};

  if (factor.factor_type === "continuous") {
    const low = Number(factor.low);
    const high = Number(factor.high);
    if (!factor.unit.trim()) {
      errors.unit = "단위를 입력해주세요. 예: °C, h, mol%";
    }
    if (!factor.low.trim()) {
      errors.low = "최소값을 입력해주세요.";
    } else if (!Number.isFinite(low)) {
      errors.low = "숫자로 입력해주세요. 예: 60";
    }
    if (!factor.high.trim()) {
      errors.high = "최대값을 입력해주세요.";
    } else if (!Number.isFinite(high)) {
      errors.high = "숫자로 입력해주세요. 예: 90";
    }
    if (factor.low.trim() && factor.high.trim() && Number.isFinite(low) && Number.isFinite(high) && low >= high) {
      errors.low = "최소값은 최대값보다 작아야 합니다.";
      errors.high = "최대값은 최소값보다 커야 합니다.";
    }
  } else {
    const levels = parseFactorLevels(factor.levels);
    if (levels.length < 2) {
      errors.levels = "비교할 후보 2개를 쉼표로 입력해주세요. 예: THF, Toluene";
    } else if (levels.length > 2) {
      errors.levels = "현재 v2 MVP에서는 후보 조건은 2개만 지원합니다.";
    }
  }

  return {
    errors,
    message: Object.keys(errors).length > 0 ? "조건 값을 확인해주세요." : "",
  };
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
  const preset = factorFromPreset(idx, idx % 2 === 1 ? "solvent" : "material");
  return {
    name_kr: preset.name_kr,
    name_en: preset.name_en,
    levels: preset.levels,
  };
}

function normalizeGoal(goal?: string): "maximize" | "minimize" {
  return goal === "minimize" ? "minimize" : "maximize";
}

function inferObjectiveFromText(intent: string) {
  const normalized = intent.trim();
  const lowerIntent = normalized.toLowerCase();
  const goal: "maximize" | "minimize" =
    /낮|줄|작|감소|최소|min|low|reduce|decrease|smaller/.test(lowerIntent)
      ? "minimize"
      : "maximize";
  const candidates = [
    "수율",
    "휘도",
    "점도",
    "용량",
    "접착력",
    "저항",
    "강도",
    "순도",
    "효율",
    "비용",
    "시간",
  ];
  const response = candidates.find((candidate) => normalized.includes(candidate));
  const fallback = normalized
    .replace(/을|를|이|가|은|는|하고|싶어요|싶습니다|높이고|낮추고|줄이고|키우고|늘리고|최적화|개선/g, " ")
    .trim()
    .split(/\s+/)[0];

  return {
    responseName: response || fallback || "Result",
    goal,
  };
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

function OnboardingCard({
  step,
  total,
  title,
  body,
  onNext,
  onClose,
}: {
  step: number;
  total: number;
  title: string;
  body: string;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="onboarding-card" role="note" aria-label="시작 안내">
      <button
        className="onboarding-close"
        type="button"
        onClick={onClose}
        aria-label="안내 닫기"
      >
        <X size={15} />
      </button>
      <strong>{title}</strong>
      <p>{body}</p>
      <div className="onboarding-footer">
        <span>{step}/{total}</span>
        <button type="button" onClick={onNext}>
          {step === total ? "완료" : "다음"}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [experimentIntent, setExperimentIntent] = useState("");
  const [projectName, setProjectName] = useState("New experiment");
  const [projectSlogan, setProjectSlogan] = useState("감이 아니라 근거로 실험하세요.");
  const [responseName, setResponseName] = useState("Result");
  const [projectGoal, setProjectGoal] = useState<"maximize" | "minimize">("maximize");
  const [factors, setFactors] = useState<FactorInput[]>(defaultFactors);
  const [isIntroComplete, setIsIntroComplete] = useState(false);
  const [introStep, setIntroStep] = useState(0);
  const [isSetupStarted, setIsSetupStarted] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
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
  const [factorPresetSelections, setFactorPresetSelections] =
    useState<Record<number, FactorPresetId>>(initialFactorPresetSelections);
  const [manualEnglishNameEdits, setManualEnglishNameEdits] = useState<Record<number, boolean>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [isTourDismissed, setIsTourDismissed] = useState(false);
  const [factorTypeHelp, setFactorTypeHelp] = useState<FactorInput["factor_type"] | null>(null);
  const [projectList, setProjectList] = useState<ProjectListItem[]>([]);
  const [surfaceData, setSurfaceData] = useState<SurfaceData | null>(null);
  const [surfaceMessage, setSurfaceMessage] = useState(
    "예측 그래프 갱신를 눌러 contour plot을 생성하세요.",
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
  const reportConclusion = useMemo(() => {
    if (!report) return null;
    const topDriver = report.top_drivers[0];
    const firstRecommendation = report.recommendations[0];
    return {
      summary: topDriver
        ? `현재 데이터에서는 ${topDriver.display_name} 조건이 결과에 가장 큰 영향을 주고 있어요.`
        : "현재 데이터로 중요한 조건을 확인하고 있어요.",
      nextStep: firstRecommendation
        ? `다음 실험에서는 ${firstRecommendation.strategy} 조건을 먼저 확인해 보세요.`
        : "결과를 더 입력하면 다음 실험 조건을 추천할 수 있어요.",
    };
  }, [report]);
  const surfaceScale = useMemo(() => {
    if (!surfaceData) return { min: 0, max: 0 };
    const values = surfaceData.z_matrix.flat();
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [surfaceData]);
  const completedResultCount = useMemo(
    () =>
      designRuns.filter((run) => {
        const value = yields[run.run_order] ?? run.result?.response ?? "";
        return value.trim().length > 0;
      }).length,
    [designRuns, yields],
  );
  const workspaceStep = report
    ? 2
    : completedResultCount > 0
      ? 1
      : 0;
  const workspaceSteps = [
    {
      label: "실험표 확인",
      detail: `${designRuns.length || project?.run_budget || 0}개 조합`,
    },
    {
      label: "결과 입력",
      detail: `${completedResultCount}/${designRuns.length || project?.run_budget || 0} 입력`,
    },
    {
      label: "분석 보기",
      detail: report ? "리포트 준비됨" : "결과 저장 후 확인",
    },
  ];
  const tourSteps = project
    ? [
        {
          title: "먼저 실험표를 확인하세요",
          body: "위에서 만든 조합대로 실험을 수행한 뒤, 아래 결과 입력으로 이동하면 됩니다.",
        },
        {
          title: "결과값을 입력하고 저장하세요",
          body: "각 Run에서 얻은 측정 결과를 넣고 결과 저장을 누르면 분석 준비가 끝납니다.",
        },
        {
          title: "분석 보기로 다음 조건을 확인하세요",
          body: "중요한 조건, 다음 실험 추천, Pareto와 contour plot을 Report에서 확인합니다.",
        },
      ]
    : isIntroComplete
      ? [
          {
            title: "조건 4개부터 고르세요",
            body: "처음이라면 기본값 그대로 시작해도 됩니다. 조건명은 나중에 바꿀 수 있습니다.",
          },
          {
            title: "각 조건의 값을 확인하세요",
            body: "숫자 범위형은 단위, 최소값, 최대값만 입력하면 됩니다.",
          },
          {
            title: "측정 결과를 정하세요",
            body: "수율, 휘도, 점도처럼 실험 후 비교할 값을 하나 정합니다.",
          },
          {
            title: "실험표를 생성하세요",
            body: "요약이 맞다면 실험표 생성 버튼을 눌러 Workspace로 이동합니다.",
          },
        ]
      : [
          {
            title: "먼저 목표를 한 문장으로 적어보세요",
            body: "수율을 높이고 싶어요처럼 쓰면 측정 결과와 방향을 먼저 잡아둡니다.",
          },
          {
            title: "예시를 눌러 시작해도 됩니다",
            body: "처음이라면 추천 목표를 선택하고 바로 실험 설정으로 넘어가세요.",
          },
          {
            title: "다음 화면부터는 하나씩만 묻습니다",
            body: "조건 하나, 값 하나씩 따라가면 실험표와 분석까지 이어집니다.",
          },
        ];
  const activeTourStep = tourSteps[Math.min(tourStep, tourSteps.length - 1)];
  const showTour = currentUser && isIntroComplete && !isTourDismissed && activeTourStep;
  const introSteps = ["소개", "목표", "조건", "분석", "시작"];
  const wizardPhaseIndex = wizardStep <= 3 ? 0 : wizardStep <= 7 ? 1 : wizardStep <= 10 ? 2 : 3;
  const conditionStepIndex = wizardStep >= 0 && wizardStep <= 3 ? wizardStep : null;
  const valueStepIndex = wizardStep >= 4 && wizardStep <= 7 ? wizardStep - 4 : null;
  const activeConditionIndex = conditionStepIndex ?? valueStepIndex ?? 0;
  const activeFactor = factors[activeConditionIndex] ?? factors[0];
  const activeFactorErrors = activeFactor ? factorErrors[activeFactor.idx] ?? {} : {};
  const activeFactorKey = factorKeys[activeConditionIndex] ?? String(activeConditionIndex + 1);
  const activeFactorPresetOptions = presetOptionsForFactorType(activeFactor.factor_type);
  const activeFactorPresetSelection = activeFactorPresetOptions.some(
    (option) => option.id === factorPresetSelections[activeFactor.idx],
  )
    ? factorPresetSelections[activeFactor.idx]
    : "custom";

  const loadProjects = useCallback(async () => {
    try {
      setProjectList(await apiRequest<ProjectListItem[]>("/api/projects/"));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to load projects.");
    }
  }, []);

  const initializeAuth = useCallback(async () => {
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
  }, [loadProjects]);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

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
      setStatusText(`${user.username}님으로 로그인했어요.`);
      await loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 로그인할 수 있어요.");
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
      setProjectName("New experiment");
      setProjectSlogan("감이 아니라 근거로 실험하세요.");
      setResponseName("Result");
      setProjectGoal("maximize");
      setFactors(defaultFactors);
      setFactorPresetSelections(initialFactorPresetSelections);
      setManualEnglishNameEdits({});
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
      setStatusText("로그아웃했어요.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 로그아웃할 수 있어요.");
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
          ...(field === "name_kr" ? { name_en: undefined } : {}),
        },
      }));
      if (field === "name_en") {
        setManualEnglishNameEdits((current) => ({
          ...current,
          [factorIdx]: value.trim().length > 0,
        }));
      }
      if (field === "factor_type") {
        setManualEnglishNameEdits((current) => ({
          ...current,
          [factorIdx]: false,
        }));
      }
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
        if (field === "name_kr") {
          const nextSuggestion = suggestedEnglishNameFromKorean(value);
          const shouldUpdateEnglishName =
            nextSuggestion && !manualEnglishNameEdits[factor.idx];

          return {
            ...factor,
            name_kr: value,
            name_en: shouldUpdateEnglishName ? nextSuggestion : factor.name_en,
          };
        }
        return { ...factor, [field]: value };
      }),
    );
  }

  function handleFactorTypeChange(index: number, factorType: FactorInput["factor_type"]) {
    const factorIdx = factors[index]?.idx;
    updateFactor(index, "factor_type", factorType);
    if (factorIdx) {
      setFactorPresetSelections((current) => ({
        ...current,
        [factorIdx]: defaultPresetIdForFactorType(factorIdx, factorType),
      }));
    }
    setFactorTypeHelp(factorType);
  }

  function applyFactorPreset(index: number, presetId: FactorPresetId) {
    const factorIdx = factors[index]?.idx;
    if (factorIdx) {
      setFactorPresetSelections((current) => ({
        ...current,
        [factorIdx]: presetId,
      }));
      setManualEnglishNameEdits((current) => ({
        ...current,
        [factorIdx]: false,
      }));
    }
    if (presetId === "custom") return;
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
    setFactorPresetSelections(initialFactorPresetSelections);
    setManualEnglishNameEdits({});
    setFactorErrors({});
    setIncludeCenterPoints(false);
    setSurfaceData(null);
  }

  function applyMixedExampleFactors() {
    setFactors([
      factorFromPreset(1, "temperature"),
      factorFromPreset(2, "time"),
      factorFromPreset(3, "solvent"),
      factorFromPreset(4, "material"),
    ]);
    setFactorPresetSelections({
      1: "temperature",
      2: "time",
      3: "solvent",
      4: "material",
    });
    setManualEnglishNameEdits({});
    setFactorErrors({});
    setIncludeCenterPoints(false);
    setSurfaceData(null);
  }

  function goToWizardStep(nextStep: number) {
    setErrorText("");
    setStatusText("");
    const clampedStep = Math.max(0, Math.min(nextStep, WIZARD_LAST_STEP));
    setWizardStep(clampedStep);
    setTourStep(Math.min(clampedStep, 3));
  }

  function proceedFromConditionDetail(index: number) {
    const factor = factors[index];
    if (!factor) return;
    const validationResult = validateSingleCondition(factor);
    setFactorErrors((current) => ({
      ...current,
      [factor.idx]: validationResult.errors,
    }));
    if (validationResult.message) {
      setErrorText(validationResult.message);
      setStatusText("");
      return;
    }
    goToWizardStep(index + 1);
  }

  function proceedFromConditionValue(index: number) {
    const factor = factors[index];
    if (!factor) return;
    const validationResult = validateSingleConditionValue(factor);
    setFactorErrors((current) => ({
      ...current,
      [factor.idx]: validationResult.errors,
    }));
    if (validationResult.message) {
      setErrorText(validationResult.message);
      setStatusText("");
      return;
    }
    goToWizardStep(index + 5);
  }

  function proceedFromResultSettings() {
    if (!responseName.trim()) {
      setErrorText("측정 결과 이름을 입력해주세요. 예: 수율, 휘도, 점도");
      setStatusText("");
      return;
    }
    goToWizardStep(9);
  }

  function proceedFromGoalSettings() {
    goToWizardStep(10);
  }

  function proceedFromProjectName() {
    if (!projectName.trim()) {
      setErrorText("프로젝트명을 입력해주세요.");
      setStatusText("");
      return;
    }
    goToWizardStep(11);
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
    if (wizardStep !== WIZARD_LAST_STEP) {
      return;
    }
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
    setSurfaceMessage("결과를 입력한 뒤 예측 그래프 갱신를 눌러 contour plot을 생성하세요.");

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
      setIsIntroComplete(true);
      setIsSetupStarted(true);
      setWizardStep(3);
      setTourStep(0);
      setYields({});
      setYieldErrors({});
      setResultHistory([]);
      setExpandedHistoryRuns({});
      const availableSurfaceFactors = continuousFactors(factors);
      setSurfaceXFactor(factorDisplayName(availableSurfaceFactors[0] ?? factors[0]));
      setSurfaceYFactor(
        factorDisplayName(availableSurfaceFactors[1] ?? availableSurfaceFactors[0] ?? factors[1]),
      );
      setStatusText("실험표를 만들었어요.");
      void loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 실험표를 만들 수 있어요.");
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
      setStatusText("프로젝트를 저장했어요.");
      void loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 프로젝트를 저장할 수 있어요.");
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
      setStatusText("프로젝트를 복제했어요.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 프로젝트를 복제할 수 있어요.");
    } finally {
      setIsBusy(false);
    }
  }

  function resetProjectState() {
    setProject(null);
    setProjectName("New experiment");
    setProjectSlogan("감이 아니라 근거로 실험하세요.");
    setExperimentIntent("");
    setResponseName("Result");
    setProjectGoal("maximize");
    setFactors(defaultFactors);
    setFactorPresetSelections(initialFactorPresetSelections);
    setManualEnglishNameEdits({});
    setFactorErrors({});
    setIsIntroComplete(false);
    setIntroStep(0);
    setIsSetupStarted(false);
    setWizardStep(0);
    setDesignRuns([]);
    setYields({});
    setYieldErrors({});
    setReport(null);
    setResultHistory([]);
    setExpandedHistoryRuns({});
    setSurfaceData(null);
    setSurfaceMessage("예측 그래프 갱신를 눌러 contour plot을 생성하세요.");
    setTourStep(0);
  }

  function startNewExperiment(intentOverride?: string) {
    const nextIntent = typeof intentOverride === "string" ? intentOverride : experimentIntent;
    const inferredObjective = inferObjectiveFromText(nextIntent);
    resetProjectState();
    setExperimentIntent(nextIntent);
    if (nextIntent.trim()) {
      setResponseName(inferredObjective.responseName);
      setProjectGoal(inferredObjective.goal);
      setProjectName(`${inferredObjective.responseName} ${inferredObjective.goal === "maximize" ? "향상" : "저감"} 실험`);
    }
    setIsIntroComplete(true);
    setIsSetupStarted(true);
    setWizardStep(0);
    setTourStep(0);
    setStatusText("");
    setErrorText("");
  }

  function hasDataToConfirmBeforeHome() {
    const hasEditedFactors =
      factors.length !== defaultFactors.length ||
      factors.some((factor, index) => hasFactorChangedFromDefault(factor, index));
    const hasTypedResults = Object.values(yields).some((value) => value.trim().length > 0);

    return (
      Boolean(project) ||
      designRuns.length > 0 ||
      resultHistory.length > 0 ||
      Boolean(report) ||
      hasTypedResults ||
      experimentIntent.trim().length > 0 ||
      projectName !== "New experiment" ||
      projectSlogan !== "감이 아니라 근거로 실험하세요." ||
      responseName !== "Result" ||
      projectGoal !== "maximize" ||
      (includeCenterPoints && hasContinuousFactor) ||
      hasEditedFactors
    );
  }

  function handleReturnHomeWithConfirm() {
    if (hasDataToConfirmBeforeHome()) {
      const shouldReturn = window.confirm(
        "첫 화면으로 이동하면 현재 입력 중인 실험 설정과 저장하지 않은 결과값이 사라집니다. 계속할까요?",
      );
      if (!shouldReturn) return;
    }

    resetProjectState();
    void loadProjects();
  }

  function handleBrandHomeClick() {
    if (!currentUser) {
      resetProjectState();
      return;
    }

    if (isIntroComplete || project || isSetupStarted) {
      handleReturnHomeWithConfirm();
      return;
    }

    resetProjectState();
    void loadProjects();
  }

  async function handleDeleteProjectById(projectId: number, projectTitle: string) {
    const shouldDelete = window.confirm(
      `"${projectTitle}" 프로젝트를 삭제할까요?\n조건, 실험표, 결과가 함께 삭제됩니다. 취소를 누르면 그대로 둘 수 있어요.`,
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
      setStatusText("프로젝트를 삭제했어요.");
      await loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 프로젝트를 삭제할 수 있어요.");
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
      setSurfaceMessage("예측 그래프 갱신를 눌러 contour plot을 생성하세요.");
      setStatusText(`실험 결과 ${filledRuns.length}개를 저장했어요.`);
      void loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 실험 결과를 저장할 수 있어요.");
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
      setStatusText("분석 결과를 불러왔어요.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 분석 결과를 볼 수 있어요.");
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
      setStatusText("CSV 파일을 내려받았어요.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 CSV 파일을 받을 수 있어요.");
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
      setStatusText("PDF 리포트를 내려받았어요.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 PDF 리포트를 받을 수 있어요.");
    } finally {
      setIsBusy(false);
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
      setResponseName(detail.project.response_name || "Result");
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
      setFactorPresetSelections(
        restoredFactors.reduce<Record<number, FactorPresetId>>((selections, factor) => {
          selections[factor.idx] = factorPresetId(factor);
          return selections;
        }, {}),
      );
      setManualEnglishNameEdits(
        restoredFactors.reduce<Record<number, boolean>>((edits, factor) => {
          edits[factor.idx] = Boolean(factor.name_en.trim()) && !isKnownSuggestedEnglishName(factor.name_en);
          return edits;
        }, {}),
      );
      setFactorErrors({});
      setIsIntroComplete(true);
      setIsSetupStarted(true);
      setWizardStep(3);
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
      setTourStep(0);
      setSurfaceData(null);
      setSurfaceMessage(
        Object.keys(restoredYields).length > 0
          ? "예측 그래프 갱신를 눌러 contour plot을 생성하세요."
          : "결과를 입력한 뒤 예측 그래프 갱신를 눌러 contour plot을 생성하세요.",
      );
      setStatusText("프로젝트를 열었어요.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "다시 시도하면 프로젝트를 열 수 있어요.");
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
      {(!currentUser || isIntroComplete) && (
      <section className={isSetupStarted ? "hero-card workflow-header" : "hero-card"}>
        <button
          className="brand-home-button"
          type="button"
          onClick={handleBrandHomeClick}
          aria-label="Coreacta DOE 첫 화면으로 이동"
        >
          <div className="hero-copy">
            <span>실험 최적화</span>
            <h1>Coreacta DOE</h1>
            <p>감이 아니라 근거로 실험하세요.</p>
          </div>
        </button>
        <div className="hero-meta">
          {currentUser ? (
            <>
              <span>로그인 사용자</span>
              <strong>{currentUser.username}</strong>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleLogout()}
                disabled={isBusy}
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <span>API</span>
              <strong>{API_BASE_URL || "동일 도메인"}</strong>
            </>
          )}
        </div>
      </section>
      )}

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
      {currentUser && (errorText || statusText) && (
        <div className={errorText ? "notice error" : "notice"}>
          {errorText || statusText}
        </div>
      )}

      {!isIntroComplete && (
        <section className="welcome-screen">
          <div className="welcome-account" aria-label="로그인 정보">
            <span>{currentUser.username}</span>
            <button
              className="welcome-logout"
              type="button"
              onClick={() => void handleLogout()}
              disabled={isBusy}
            >
              로그아웃
            </button>
          </div>

          <div className="welcome-content">
            {introStep > 0 && (
              <div className="intro-progress" aria-label="첫 화면 안내 단계">
                {introSteps.map((step, index) => (
                  <button
                    key={step}
                    className={index === introStep ? "active" : index < introStep ? "complete" : ""}
                    type="button"
                    onClick={() => setIntroStep(index)}
                    aria-current={index === introStep ? "step" : undefined}
                  >
                    {step}
                  </button>
                ))}
              </div>
            )}

            {introStep === 0 && (
              <div className="intro-panel intro-panel-first">
                <h1>Coreacta DOE</h1>
                <p className="welcome-slogan">4개의 조건을 바꿔보며 가장 좋은 실험 방향을 찾습니다.</p>
                <div className="service-flow-strip intro-flow-strip" aria-label="Coreacta DOE 진행 흐름">
                  <span>조건 4개 선택</span>
                  <span>8회 실험표 생성</span>
                  <span>결과 입력</span>
                  <span>분석 확인</span>
                </div>
                <div className="intro-actions">
                  <button
                    className="welcome-start-button"
                    type="button"
                    onClick={() => setIntroStep(1)}
                  >
                    무엇을 해주는지 보기
                  </button>
                </div>
              </div>
            )}

            {introStep === 1 && (
              <div className="intro-panel">
                <h1>먼저 목표를 말해요</h1>
                <p className="welcome-description">
                  “수율을 높이고 싶어요”처럼 원하는 결과를 한 문장으로 적습니다.
                </p>
                <form
                  className="intent-composer compact-intent-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setIntroStep(2);
                  }}
                >
                  <label>
                    <span>실험 목표</span>
                    <div className="intent-input-shell">
                      <input
                        value={experimentIntent}
                        onChange={(event) => setExperimentIntent(event.target.value)}
                        placeholder="예: 수율을 높이고 싶어요"
                      />
                      <div className="intent-suggestions" aria-label="목표 예시">
                        {objectiveSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.label}
                            type="button"
                            onClick={() => setExperimentIntent(suggestion.prompt)}
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </label>
                </form>
                <div className="intro-actions">
                  <button className="secondary-button" type="button" onClick={() => setIntroStep(0)}>
                    이전
                  </button>
                  <button
                    className="welcome-start-button"
                    type="button"
                    onClick={() => setIntroStep(2)}
                  >
                    다음 안내 보기
                  </button>
                </div>
              </div>
            )}

            {introStep === 2 && (
              <div className="intro-panel">
                <h1>조건을 하나씩 정해요</h1>
                <p className="welcome-description">
                  온도, 시간, 농도처럼 바꿔볼 조건을 한 화면에서 하나씩 확인합니다.
                </p>
                <div className="intro-actions">
                  <button className="secondary-button" type="button" onClick={() => setIntroStep(1)}>
                    이전
                  </button>
                  <button
                    className="welcome-start-button"
                    type="button"
                    onClick={() => setIntroStep(3)}
                  >
                    다음 안내 보기
                  </button>
                </div>
              </div>
            )}

            {introStep === 3 && (
              <div className="intro-panel">
                <h1>실험표와 분석을 받아요</h1>
                <p className="welcome-description">
                  정해진 조합대로 실험하고 결과를 입력하면 중요한 조건과 다음 실험 방향을 보여줍니다.
                </p>
                <div className="intro-actions">
                  <button className="secondary-button" type="button" onClick={() => setIntroStep(2)}>
                    이전
                  </button>
                  <button
                    className="welcome-start-button"
                    type="button"
                    onClick={() => setIntroStep(4)}
                  >
                    시작 준비하기
                  </button>
                </div>
              </div>
            )}

            {introStep === 4 && (
              <div className="intro-panel">
                <h1>이제 조건을 정해볼까요?</h1>
                <div className="quick-start-note" aria-label="처음 시작 안내">
                  <Sparkles size={16} />
                  <span>{experimentIntent.trim() || "목표는 비워두고 시작할 수도 있어요."}</span>
                </div>
                <form
                  className="intent-composer final-start-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startNewExperiment();
                  }}
                >
                  <button className="welcome-start-button tour-target" type="submit">
                    내 실험 최적화 시작하기
                  </button>
                </form>
                <button className="secondary-button quiet-back-button" type="button" onClick={() => setIntroStep(3)}>
                  이전
                </button>
              </div>
            )}

            {introStep === 4 && projectList.length > 0 && (
              <div className="recent-projects">
                <span>최근 프로젝트 열기</span>
                {projectList.slice(0, 3).map((item) => (
                  <button
                    className="recent-project-button"
                    key={item.project_id}
                    type="button"
                    onClick={() => void handleLoadProject(item.project_id)}
                    disabled={isBusy}
                  >
                    <strong>{item.name}</strong>
                    <small>
                      조건 {item.factor_count}개 · 결과 {item.result_count}/{item.run_budget}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {isIntroComplete && !project && (
      <form className="card setup-card wizard-card guided-wizard-card" data-step={wizardStep} onSubmit={handleGenerateDesign}>
        <div className="wizard-flow-progress" aria-label="실험 설정 진행 흐름">
          {["조건 선택", "값 입력", "결과 설정", "실험표 생성"].map((step, index) => (
            <span className={index === wizardPhaseIndex ? "active" : index < wizardPhaseIndex ? "complete" : ""} key={step}>
              {step}
            </span>
          ))}
        </div>
        <div className="wizard-progress compact-progress" aria-label="실험 생성 단계">
          {guidedWizardSteps.map((step, index) => (
            <span className={index === wizardStep ? "active" : index < wizardStep ? "complete" : ""} key={step} title={step}>
              {index + 1}
            </span>
          ))}
        </div>

        <div className="wizard-step-shell">
          <div className="wizard-step-copy">
            <span>{wizardStep + 1} / {guidedWizardSteps.length}</span>
            <h2>
              {conditionStepIndex !== null && `바꿔볼 조건 ${conditionStepIndex + 1}을 정해주세요`}
              {valueStepIndex !== null && `${activeFactor.name_kr || `조건 ${valueStepIndex + 1}`}의 값을 입력해주세요`}
              {wizardStep === 8 && "무엇을 비교할까요?"}
              {wizardStep === 9 && "어떤 방향이 좋은 결과인가요?"}
              {wizardStep === 10 && "프로젝트 이름을 정해주세요"}
              {wizardStep === 11 && "실험표를 생성할 준비가 되었습니다"}
            </h2>
            <p>
              {conditionStepIndex !== null && "결과에 영향을 줄 것 같은 조건을 하나만 확인하세요. 잘 모르겠다면 기본값 그대로 다음으로 넘어가도 됩니다."}
              {valueStepIndex !== null && "이 조건에서 비교할 두 끝값을 입력합니다. 선택형 조건은 후보 2개만 적으면 됩니다."}
              {wizardStep === 8 && "실험 후 매번 기록할 측정 결과 이름을 하나 입력합니다."}
              {wizardStep === 9 && "측정 결과가 커질수록 좋은지, 작아질수록 좋은지만 선택합니다."}
              {wizardStep === 10 && "나중에 다시 찾기 쉬운 이름을 붙여주세요."}
              {wizardStep === 11 && "입력한 조건과 측정 결과를 확인한 뒤 실험표를 생성합니다."}
            </p>
          </div>

          <div className="single-input-panel">
            {showTour && (
              <OnboardingCard
                step={Math.min(tourStep, tourSteps.length - 1) + 1}
                total={tourSteps.length}
                title={activeTourStep.title}
                body={activeTourStep.body}
                onNext={() => {
                  if (tourStep >= tourSteps.length - 1) {
                    setIsTourDismissed(true);
                    return;
                  }
                  setTourStep((current) => current + 1);
                }}
                onClose={() => setIsTourDismissed(true)}
              />
            )}

            {conditionStepIndex !== null && (
              <article className="factor-row focus-factor-card">
                <div className="factor-row-heading">
                  <strong>조건 {conditionStepIndex + 1}</strong>
                  <span>{activeFactor.factor_type === "continuous" ? "숫자 범위형" : "선택형"}</span>
                </div>
                <div className="factor-fields single-factor-fields">
                  <label className="factor-cell">
                    <span className="factor-label-row">
                      조건 유형
                      <button
                        className="type-help-trigger"
                        type="button"
                        onClick={() => setFactorTypeHelp(activeFactor.factor_type)}
                        aria-label={`${activeFactor.factor_type === "continuous" ? "숫자 범위형" : "선택형"} 설명 보기`}
                      >
                        설명
                      </button>
                    </span>
                    <select
                      value={activeFactor.factor_type}
                      onChange={(event) =>
                        handleFactorTypeChange(
                          conditionStepIndex,
                          event.target.value as FactorInput["factor_type"],
                        )
                      }
                    >
                      <option value="continuous">숫자 범위형</option>
                      <option value="categorical">선택형</option>
                    </select>
                  </label>
                  <label className="factor-cell">
                    <span>기본 조건</span>
                    <select value={activeFactorPresetSelection} onChange={(event) => applyFactorPreset(conditionStepIndex, event.target.value as FactorPresetId)}>
                      {activeFactorPresetOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label} · {option.description}</option>
                      ))}
                    </select>
                  </label>
                  <label className="factor-cell">
                    <span>조건명</span>
                    <input className={activeFactorErrors.name_kr ? "invalid-input" : ""} value={activeFactor.name_kr} placeholder="예: 온도" onChange={(event) => updateFactor(conditionStepIndex, "name_kr", event.target.value)} aria-invalid={Boolean(activeFactorErrors.name_kr)} required />
                    {activeFactorErrors.name_kr && <small className="field-error">{activeFactorErrors.name_kr}</small>}
                  </label>
                  <label className="factor-cell">
                    <span>영문명</span>
                    <input className={activeFactorErrors.name_en ? "invalid-input" : ""} value={activeFactor.name_en} placeholder="예: Temperature" onChange={(event) => updateFactor(conditionStepIndex, "name_en", event.target.value)} aria-invalid={Boolean(activeFactorErrors.name_en)} required />
                    {activeFactorErrors.name_en && <small className="field-error">{activeFactorErrors.name_en}</small>}
                  </label>
                </div>
              </article>
            )}

            {valueStepIndex !== null && (
              <article className="factor-row focus-factor-card">
                <div className="factor-row-heading">
                  <strong>조건 {activeFactorKey}</strong>
                  <span>{activeFactor.name_kr} / {activeFactor.name_en}</span>
                </div>
                <div className="factor-fields single-factor-fields">
                  {activeFactor.factor_type === "continuous" ? (
                    <>
                      <label className="factor-cell">
                        <span>단위</span>
                        <input className={activeFactorErrors.unit ? "invalid-input" : ""} value={activeFactor.unit} placeholder="예: °C" onChange={(event) => updateFactor(valueStepIndex, "unit", event.target.value)} aria-invalid={Boolean(activeFactorErrors.unit)} required />
                        {activeFactorErrors.unit && <small className="field-error">{activeFactorErrors.unit}</small>}
                      </label>
                      <label className="factor-cell">
                        <span>최소값</span>
                        <input className={activeFactorErrors.low ? "numeric-input invalid-input" : "numeric-input"} value={activeFactor.low} placeholder="예: 60" onChange={(event) => updateFactor(valueStepIndex, "low", event.target.value)} aria-invalid={Boolean(activeFactorErrors.low)} required />
                        {activeFactorErrors.low && <small className="field-error">{activeFactorErrors.low}</small>}
                      </label>
                      <label className="factor-cell">
                        <span>최대값</span>
                        <input className={activeFactorErrors.high ? "numeric-input invalid-input" : "numeric-input"} value={activeFactor.high} placeholder="예: 90" onChange={(event) => updateFactor(valueStepIndex, "high", event.target.value)} aria-invalid={Boolean(activeFactorErrors.high)} required />
                        {activeFactorErrors.high && <small className="field-error">{activeFactorErrors.high}</small>}
                      </label>
                    </>
                  ) : (
                    <label className="factor-cell factor-levels">
                      <span>선택값 2개</span>
                      <input className={activeFactorErrors.levels ? "invalid-input" : ""} value={activeFactor.levels} onChange={(event) => updateFactor(valueStepIndex, "levels", event.target.value)} placeholder="예: THF, Toluene" aria-invalid={Boolean(activeFactorErrors.levels)} required />
                      {activeFactorErrors.levels && <small className="field-error">{activeFactorErrors.levels}</small>}
                    </label>
                  )}
                </div>
              </article>
            )}

            {wizardStep === 8 && (
              <label className="field single-field">
                <span>측정 결과 이름</span>
                <input value={responseName} onChange={(event) => setResponseName(event.target.value)} placeholder="예: 수율, 휘도, 점도, 용량" />
              </label>
            )}

            {wizardStep === 9 && (
              <div className="choice-panel" role="radiogroup" aria-label="목표 선택">
                <button className={projectGoal === "maximize" ? "choice-card active" : "choice-card"} type="button" onClick={() => setProjectGoal("maximize")}>
                  <strong>크게 만들기</strong>
                  <span>값이 높을수록 좋은 결과입니다.</span>
                </button>
                <button className={projectGoal === "minimize" ? "choice-card active" : "choice-card"} type="button" onClick={() => setProjectGoal("minimize")}>
                  <strong>작게 만들기</strong>
                  <span>값이 낮을수록 좋은 결과입니다.</span>
                </button>
              </div>
            )}

            {wizardStep === 10 && (
              <label className="field single-field">
                <span>프로젝트명</span>
                <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="예: 온도-농도 최적화 실험" required />
              </label>
            )}

            {wizardStep === 11 && (
              <div className="wizard-summary-grid">
                <section className="wizard-summary-panel">
                  <span>선택한 조건</span>
                  {factors.map((factor) => (
                    <div className="wizard-summary-item" key={factor.idx}>
                      <strong>{factor.name_kr} / {factor.name_en}</strong>
                      <small>
                        {factor.factor_type === "continuous"
                          ? `숫자 범위형 · ${factor.low} - ${factor.high} ${factor.unit}`
                          : `선택형 · ${parseFactorLevels(factor.levels).join(", ")}`}
                      </small>
                    </div>
                  ))}
                </section>
                <section className="wizard-summary-panel">
                  <span>측정 결과</span>
                  <div className="wizard-summary-item">
                    <strong>{responseName || "Result"}</strong>
                    <small>{projectGoal === "maximize" ? "크게 만들기" : "작게 만들기"}</small>
                  </div>
                  <label className="center-option">
                    <input type="checkbox" checked={includeCenterPoints && hasContinuousFactor} onChange={(event) => setIncludeCenterPoints(event.target.checked)} disabled={!hasContinuousFactor} />
                    <span className="label-with-help">중간값 확인 실험 3회 추가<HelpTip label="중간값 확인 실험 설명">모든 숫자 범위형 조건을 중간값으로 맞춘 확인 실험입니다. 결과가 단순한 직선 경향인지 휘어진 경향인지 확인합니다.</HelpTip></span>
                  </label>
                  <div className="wizard-summary-item">
                    <strong>{includeCenterPoints && hasContinuousFactor ? "11회 실험" : "8회 실험"}</strong>
                    <small>{includeCenterPoints && hasContinuousFactor ? "중간값 확인 실험 포함" : "기본 실험표"}</small>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        <div className="wizard-actions">
          <button className="secondary-button return-home-button" type="button" onClick={handleReturnHomeWithConfirm} disabled={isBusy}>
            첫 화면으로 이동
          </button>
          <button className="secondary-button" type="button" onClick={() => goToWizardStep(wizardStep - 1)} disabled={wizardStep === 0 || isBusy}>이전</button>
          {conditionStepIndex !== null && (
            <button className="tour-target" type="button" onClick={() => proceedFromConditionDetail(conditionStepIndex)}>
              {conditionStepIndex === 3 ? "조건 값 입력하기" : "다음 조건"}
            </button>
          )}
          {valueStepIndex !== null && (
            <button className="tour-target" type="button" onClick={() => proceedFromConditionValue(valueStepIndex)}>
              {valueStepIndex === 3 ? "측정 결과 정하기" : "다음 조건 값"}
            </button>
          )}
          {wizardStep === 8 && <button className="tour-target" type="button" onClick={proceedFromResultSettings}>목표 정하기</button>}
          {wizardStep === 9 && <button className="tour-target" type="button" onClick={proceedFromGoalSettings}>프로젝트명 정하기</button>}
          {wizardStep === 10 && <button className="tour-target" type="button" onClick={proceedFromProjectName}>요약 확인하기</button>}
          {wizardStep === 11 && <button className="tour-target" type="submit" disabled={isBusy}><Play size={16} />{isBusy ? "실험표를 만드는 중..." : "실험표 생성하기"}</button>}
        </div>
      </form>
      )}
      {project && (
      <>
      <section className="card workspace-header-card">
        <div className="workspace-header-main">
          <div className="workspace-title-area">
            <span>Workspace</span>
            <label className="workspace-name-field">
              <span>Project name</span>
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>
            <div className="workspace-meta-row">
              <span>측정 결과: {responseName || "Result"}</span>
              <span>{projectGoal === "maximize" ? "크게 만들기" : "작게 만들기"}</span>
              <span>Project {project.id}</span>
            </div>
          </div>
          <div className="workspace-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={handleReturnHomeWithConfirm}
            >
              첫 화면으로 이동
            </button>
            <button className="secondary-button" type="button" onClick={() => void handleUpdateProject()} disabled={isBusy}>
              <Save size={15} /> 프로젝트 저장하기
            </button>
            <details className="project-more-menu">
              <summary>프로젝트 관리</summary>
              <div>
                <button className="secondary-button" type="button" onClick={() => void handleDuplicateProject()} disabled={isBusy}>
                  <Copy size={15} /> 복제하기
                </button>
                <button className="danger-button" type="button" onClick={() => void handleDeleteProject()} disabled={isBusy}>
                  <Trash2 size={15} /> 삭제하기
                </button>
              </div>
            </details>
          </div>
        </div>
        <div className="workspace-progress" aria-label="Workspace 진행 상태">
          {workspaceSteps.map((step, index) => (
            <span
              className={
                index === workspaceStep
                  ? "active"
                  : index < workspaceStep
                    ? "complete"
                    : ""
              }
              key={step.label}
            >
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </span>
          ))}
        </div>
        {showTour && (
          <OnboardingCard
            step={Math.min(tourStep, tourSteps.length - 1) + 1}
            total={tourSteps.length}
            title={activeTourStep.title}
            body={activeTourStep.body}
            onNext={() => {
              if (tourStep >= tourSteps.length - 1) {
                setIsTourDismissed(true);
                return;
              }
              setTourStep((current) => current + 1);
            }}
            onClose={() => setIsTourDismissed(true)}
          />
        )}
      </section>

      <section className="card workspace-section">
        <div className="card-heading">
          <div>
            <span>Design Table</span>
            <h2>먼저 수행할 실험표</h2>
            <p>아래 조합대로 실험을 수행한 뒤 결과값을 입력하세요.</p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={handleDownloadCsv}
            disabled={!project || isBusy}
          >
            <Download size={16} />
            CSV 내려받기
          </button>
        </div>

        <div className="table-wrap">
          <table className="design-table">
            <thead>
              <tr>
                <th className="run-column">Run</th>
                {factors.map((factor) => (
                  <th className="numeric-column" key={factor.idx}>
                    {factor.factor_type === "continuous"
                      ? `${factor.name_kr}(${factor.name_en}, ${factor.unit})`
                      : `${factor.name_kr}(${factor.name_en})`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {designRuns.length === 0 ? (
                <tr>
                  <td colSpan={5}>실험표를 생성하면 실험 조합이 표시됩니다.</td>
                </tr>
              ) : (
                designRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="run-column">
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

      <section className="card workspace-section results-section">
        <div className="card-heading">
          <div>
            <span>Results Input</span>
            <h2>측정 결과 입력</h2>
            <p>각 실험 후 얻은 결과값을 입력하세요.</p>
          </div>
          <div className="button-group">
            <button
              className={completedResultCount > 0 ? "secondary-button" : "tour-target"}
              type="button"
              onClick={handleSubmitResults}
              disabled={!project || designRuns.length === 0 || isBusy}
            >
              <Send size={16} />
              실험 결과 저장하기
            </button>
          </div>
        </div>

        <div className="table-wrap compact-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th className="run-column">Run</th>
                <th className="numeric-column">{responseName || "측정 결과"}</th>
              </tr>
            </thead>
            <tbody>
              {designRuns.length === 0 ? (
                <tr>
                  <td colSpan={2}>실험표를 먼저 생성해주세요.</td>
                </tr>
              ) : (
                designRuns.map((run, index) => (
                  <tr key={run.id}>
                    <td className="run-column">
                      <span className="run-badge">Run {run.run_order}</span>
                    </td>
                    <td className="numeric-cell">
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
                    Run {run.run_order} 수정 이력 {runHistory.length}
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
            <h2>분석 결과</h2>
            <p>중요한 조건, 다음 실험 추천, 시각화와 해석을 한곳에서 확인하세요.</p>
          </div>
          <div className="report-actions">
            <button
              className={completedResultCount > 0 && !report ? "tour-target" : "secondary-button"}
              type="button"
              onClick={handleRefreshReport}
              disabled={!project || isBusy}
            >
              <RefreshCw size={16} />
              분석 결과 보기
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleDownloadPdf}
              disabled={!project || isBusy}
            >
              <FileText size={16} />
              PDF 리포트 내려받기
            </button>
          </div>
        </div>

        {!report ? (
          <p className="empty-state">결과를 입력하면 분석 결과가 표시됩니다.</p>
        ) : (
          <>
          {reportConclusion && (
            <section className="report-summary">
              <span>결론 요약</span>
              <h3>{reportConclusion.summary}</h3>
              <p>{reportConclusion.nextStep}</p>
            </section>
          )}
          <div className="report-layout">
            <div>
              <h3>중요한 조건</h3>
              <div className="driver-grid">
                {report.top_drivers.map((effect, index) => (
                  <article className="driver-card" key={effect.factor_key}>
                    <span>#{index + 1}</span>
                    <strong>{effect.display_name}</strong>
                    <div>
                      <b>영향도 {formatImpact(effect)}</b>
                      <em>{effect.direction_label || `${effect.direction} 유리`}</em>
                      <small>방향 포함 효과: {formatEffect(effect.effect)}</small>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <h3>해석 메모</h3>
              <div className="notes-box">
                {report.message ||
                  "영향도는 조건을 바꿨을 때 결과가 얼마나 달라졌는지 보여줍니다. 방향 포함 효과가 음수이면 낮은 조건이 더 유리하다고 해석합니다."}
              </div>
            </div>

            <div className="advisor-card">
              <h3>해석 요약</h3>
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
                      <th className="numeric-column">Effect</th>
                      <th className="numeric-column">p-value</th>
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
              <h3>다음 실험 추천</h3>
              {report.recommendations.length === 0 ? (
                <p className="empty-state">결과를 더 입력하면 다음 실험 조건을 추천할 수 있어요.</p>
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
                          예상 결과: {Number(recommendation.predicted_yield).toFixed(1)}%
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
          </>
        )}
        <div className="graph-section report-visuals">
        <article className="chart-card">
          <div className="card-heading">
            <div>
              <span>시각화</span>
              <h2 className="heading-with-help">
                조건별 영향 분석 (Main Effect)
                <HelpTip label="조건별 영향 분석 (Main Effect) 설명">
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

        <article className="chart-card">
          <div className="card-heading">
            <div>
              <span>시각화</span>
              <h2 className="heading-with-help">
                영향도 순위 (Pareto Chart)
                <HelpTip label="영향도 순위 (Pareto Chart) 설명">
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

        <article className="chart-card">
          <div className="card-heading">
            <div>
              <span>시각화</span>
              <h2 className="heading-with-help">
                결과 추이
                <HelpTip label="결과 추이 설명">
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

        <article className="chart-card contour-card">
          <div className="card-heading">
            <div>
              <span>결과 예측</span>
              <h2 className="heading-with-help">
                조건 조합별 예측 (Contour Plot)
                <HelpTip label="조건 조합별 예측 (Contour Plot) 설명">
                  두 조건을 동시에 바꿨을 때 예상 수율이 어떻게 달라지는지 색으로 보여주는 지도입니다. 진한 영역은 더 높은 수율이 예상되는 조건입니다.
                </HelpTip>
              </h2>
            </div>
            <button
              className="secondary-button"
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
              예측 그래프 갱신
            </button>
          </div>

          <div className="surface-controls">
            <label>
              <span>가로축 조건</span>
              <select
                value={surfaceXFactor}
                onChange={(event) => {
                  setSurfaceXFactor(event.target.value);
                  setSurfaceData(null);
                  setSurfaceMessage("예측 그래프 갱신를 눌러 contour plot을 생성하세요.");
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
              <span>세로축 조건</span>
              <select
                value={surfaceYFactor}
                onChange={(event) => {
                  setSurfaceYFactor(event.target.value);
                  setSurfaceData(null);
                  setSurfaceMessage("예측 그래프 갱신를 눌러 contour plot을 생성하세요.");
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
                {surfaceData.model} 모델로 예측한 결과입니다.
              </p>
            </div>
          )}
        </article>
        </div>
      </section>
      </>
      )}
        </>
      )}

      {factorTypeHelp && (
        <div className="type-help-backdrop" role="presentation" onClick={() => setFactorTypeHelp(null)}>
          <div
            className="type-help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="type-help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="type-help-close"
              type="button"
              onClick={() => setFactorTypeHelp(null)}
              aria-label="조건 유형 설명 닫기"
            >
              <X size={16} />
            </button>
            <span>조건 유형</span>
            <h2 id="type-help-title">{factorTypeHelpCopy[factorTypeHelp].title}</h2>
            <p>{factorTypeHelpCopy[factorTypeHelp].body}</p>
            <small>{factorTypeHelpCopy[factorTypeHelp].example}</small>
            <button className="welcome-start-button" type="button" onClick={() => setFactorTypeHelp(null)}>
              알겠어요
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
