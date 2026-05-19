"use client";

import { FormEvent, useMemo, useState } from "react";

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
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as ApiResponse<T | null>;

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

  const factorKeys = useMemo(() => factors.map((factor) => "ABCD"[factor.idx - 1]), [factors]);

  function updateFactor(index: number, field: keyof FactorInput, value: string) {
    setFactors((current) =>
      current.map((factor, itemIndex) =>
        itemIndex === index ? { ...factor, [field]: value } : factor,
      ),
    );
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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Coreacta DOE</h1>
          <p>감이 아니라 근거로 실험하세요.</p>
        </div>
        <span className="api-base">{API_BASE_URL}</span>
      </header>

      {(errorText || statusText) && (
        <div className={errorText ? "notice error" : "notice"}>
          {errorText || statusText}
        </div>
      )}

      <form className="section setup-section" onSubmit={handleGenerateDesign}>
        <div className="section-heading">
          <div>
            <span>Project Setup</span>
            <h2>Reaction and factors</h2>
          </div>
          <button type="submit" disabled={isBusy}>
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
                value={factor.low}
                onChange={(event) => updateFactor(index, "low", event.target.value)}
                required
              />
              <input
                value={factor.high}
                onChange={(event) => updateFactor(index, "high", event.target.value)}
                required
              />
            </div>
          ))}
        </div>
      </form>

      <section className="section">
        <div className="section-heading">
          <div>
            <span>Design Table</span>
            <h2>{project ? `${project.name} · Project ${project.id}` : "No design yet"}</h2>
          </div>
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
                <th>Yield (%)</th>
              </tr>
            </thead>
            <tbody>
              {designRuns.length === 0 ? (
                <tr>
                  <td colSpan={6}>Generate a design to view 8 runs.</td>
                </tr>
              ) : (
                designRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{run.run_order}</td>
                    {factorKeys.map((factorKey) => (
                      <td key={factorKey}>{formatFactorValue(run, factorKey)}</td>
                    ))}
                    <td>
                      <input
                        className="yield-input"
                        inputMode="decimal"
                        value={yields[run.run_order] ?? ""}
                        onChange={(event) =>
                          setYields((current) => ({
                            ...current,
                            [run.run_order]: event.target.value,
                          }))
                        }
                        placeholder="Yield"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="actions-row">
          <button
            type="button"
            onClick={handleSubmitResults}
            disabled={!project || designRuns.length === 0 || isBusy}
          >
            Submit Results
          </button>
          <button type="button" onClick={handleRefreshReport} disabled={!project || isBusy}>
            Refresh Report
          </button>
        </div>
      </section>

      <section className="section report-section">
        <div className="section-heading">
          <div>
            <span>Report</span>
            <h2>Top drivers and next runs</h2>
          </div>
        </div>

        {!report ? (
          <p className="empty-state">Submit results to calculate the report.</p>
        ) : (
          <div className="report-grid">
            <div>
              <h3>Top Drivers</h3>
              <table className="compact-table">
                <thead>
                  <tr>
                    <th>Factor</th>
                    <th>Effect</th>
                    <th>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {report.top_drivers.map((effect) => (
                    <tr key={effect.factor_key}>
                      <td>{effect.display_name}</td>
                      <td>{formatEffect(effect.effect)}</td>
                      <td>{effect.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    <strong>#{recommendation.rank} {recommendation.strategy}</strong>
                    <div>
                      {Object.entries(recommendation.conditions).map(([key, condition]) => (
                        <span key={key}>
                          {key}: {condition.direction} · {condition.value}
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
    </main>
  );
}
