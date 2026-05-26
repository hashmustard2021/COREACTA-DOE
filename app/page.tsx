"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Download, FlaskConical, Play, RefreshCw, Send } from "lucide-react";
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
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message: string;
};

type FactorInput = {
  idx: number;
  name_kr: string;
  name_en: string;
  unit: string;
  low: string;
  high: string;
};

type Project = {
  id: number;
  name: string;
  factors: Array<FactorInput & { id: number; display_name: string }>;
};

type ProjectListItem = {
  project_id: number;
  name: string;
  created_at: string;
  run_budget: number;
  response_name: string;
  factor_count: number;
  result_count: number;
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
  display_name: string;
  effect: number | null;
  direction: "HIGH" | "LOW" | "NEUTRAL";
};

type Recommendation = {
  rank: number;
  strategy: string;
  conditions: Record<
    string,
    {
      factor_idx: number;
      display_name: string;
      direction: "HIGH" | "LOW" | "NEUTRAL";
      value: number | string;
    }
  >;
};

type Report = {
  project: { id: number; name: string };
  effects: Effect[];
  top_drivers: Effect[];
  message: string;
  recommendations: Recommendation[];
};

type ResultRecord = {
  id: number;
  run_order: number;
  response: string;
  note: string;
  created_at: string;
  updated_at: string;
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
    name_kr: "온도",
    name_en: "Temperature",
    unit: "°C",
    low: "60",
    high: "90",
  },
  {
    idx: 2,
    name_kr: "시간",
    name_en: "Time",
    unit: "h",
    low: "1",
    high: "4",
  },
  {
    idx: 3,
    name_kr: "촉매량",
    name_en: "Catalyst loading",
    unit: "mol%",
    low: "0.5",
    high: "5",
  },
  {
    idx: 4,
    name_kr: "농도",
    name_en: "Concentration",
    unit: "M",
    low: "0.05",
    high: "0.30",
  },
];

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    mode: "cors",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
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

function effectDirectionLabel(effect: number) {
  if (effect > 0) return "HIGH가 유리";
  if (effect < 0) return "LOW가 유리";
  return "NEUTRAL";
}

export default function Home() {
  const [projectName, setProjectName] = useState("Suzuki coupling optimization");
  const [factors, setFactors] = useState<FactorInput[]>(defaultFactors);
  const [project, setProject] = useState<Project | null>(null);
  const [designRuns, setDesignRuns] = useState<DesignRun[]>([]);
  const [yields, setYields] = useState<Record<number, string>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectList, setProjectList] = useState<ProjectListItem[]>([]);
  const yieldInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const factorKeys = useMemo(
    () => factors.map((factor) => "ABCD"[factor.idx - 1]),
    [factors],
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
          directionLabel: effectDirectionLabel(value),
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

  useEffect(() => {
    void loadProjects();
  }, []);

  function updateFactor(index: number, field: keyof FactorInput, value: string) {
    setFactors((current) =>
      current.map((factor, itemIndex) =>
        itemIndex === index ? { ...factor, [field]: value } : factor,
      ),
    );
  }

  function focusNextYieldInput(
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
  ) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    yieldInputRefs.current[index + 1]?.focus();
  }

  async function handleGenerateDesign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setErrorText("");
    setStatusText("");
    setReport(null);

    try {
      const createdProject = await apiRequest<Project>("/api/projects/", {
        method: "POST",
        body: JSON.stringify({
          name: projectName,
          description: "",
          factors,
        }),
      });
      const design = await apiRequest<DesignRun[]>(
        `/api/projects/${createdProject.id}/design/`,
        { method: "POST" },
      );

      setProject(createdProject);
      setDesignRuns(design);
      setYields({});
      setStatusText(`Project ${createdProject.id} design generated.`);
      void loadProjects();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to generate design.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSubmitResults() {
    if (!project) return;
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
      setFactors(
        detail.factors.map((factor) => ({
          idx: factor.idx,
          name_kr: factor.name_kr,
          name_en: factor.name_en,
          unit: factor.unit,
          low: String(factor.low),
          high: String(factor.high),
        })),
      );
      setDesignRuns(detail.design_runs);
      setYields(restoredYields);
      setReport(await apiRequest<Report>(`/api/projects/${projectId}/report/`));
      setStatusText(`Project ${projectId} loaded.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to load project.");
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
          <span>API</span>
          <strong>{API_BASE_URL}</strong>
        </div>
      </section>

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
              <button
                className={project?.id === item.project_id ? "project-item active" : "project-item"}
                key={item.project_id}
                type="button"
                onClick={() => void handleLoadProject(item.project_id)}
                disabled={isBusy}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>Project {item.project_id}</small>
                </span>
                <em>{item.factor_count} factors</em>
                <em>{item.result_count}/{item.run_budget} {item.response_name}</em>
              </button>
            ))}
          </div>
        )}
      </section>

      {(errorText || statusText) && (
        <div className={errorText ? "notice error" : "notice"}>
          {errorText || statusText}
        </div>
      )}

      <form className="card setup-card" onSubmit={handleGenerateDesign}>
        <div className="card-heading">
          <div>
            <span>Project Setup</span>
            <h2>Reaction and factors</h2>
          </div>
          <button type="submit" disabled={isBusy}>
            <Play size={16} />
            {isBusy ? "Working..." : "Generate Design"}
          </button>
        </div>

        <label className="field project-name">
          <span>Project name</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            required
          />
        </label>

        <div className="factor-grid">
          <span>Factor</span>
          <span>name_kr</span>
          <span>name_en</span>
          <span>unit</span>
          <span>low</span>
          <span>high</span>
          {factors.map((factor, index) => (
            <div className="factor-row" key={factor.idx}>
              <strong>{factorKeys[index]}</strong>
              <input
                value={factor.name_kr}
                onChange={(event) => updateFactor(index, "name_kr", event.target.value)}
                required
              />
              <input
                value={factor.name_en}
                onChange={(event) => updateFactor(index, "name_en", event.target.value)}
                required
              />
              <input
                value={factor.unit}
                onChange={(event) => updateFactor(index, "unit", event.target.value)}
              />
              <input
                className="numeric-input"
                value={factor.low}
                onChange={(event) => updateFactor(index, "low", event.target.value)}
                required
              />
              <input
                className="numeric-input"
                value={factor.high}
                onChange={(event) => updateFactor(index, "high", event.target.value)}
                required
              />
            </div>
          ))}
        </div>
      </form>

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
                      <input
                        ref={(element) => {
                          yieldInputRefs.current[index] = element;
                        }}
                        className="yield-input numeric-input"
                        inputMode="decimal"
                        value={yields[run.run_order] ?? ""}
                        onChange={(event) =>
                          setYields((current) => ({
                            ...current,
                            [run.run_order]: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => focusNextYieldInput(event, index)}
                        placeholder="예: 61.5"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card report-card">
        <div className="card-heading">
          <div>
            <span>Report</span>
            <h2>Top drivers and recommended next runs</h2>
          </div>
          <FlaskConical className="report-icon" size={24} />
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
                      <b>{formatEffect(effect.effect)}</b>
                      <em>{effect.direction}</em>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <h3>Notes</h3>
              <div className="notes-box">
                {report.message || `Calculated ${report.top_drivers.length} valid effect(s).`}
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
                    <div className="condition-grid">
                      {Object.entries(recommendation.conditions).map(([key, condition]) => (
                        <span key={key}>
                          <b>{key}</b>
                          {condition.direction} · {condition.value}
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
              <h2>Main Effect Analysis</h2>
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
              <h2>Yield Trend</h2>
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
      </section>
    </main>
  );
}
