const steps = [
  "서비스 이해",
  "목표 입력",
  "조건 설정",
  "실험표 확인",
  "결과 분석",
];

const conditions = [
  { name: "온도", en: "Temperature", type: "숫자 범위형", value: "50-80 °C" },
  { name: "시간", en: "Time", type: "숫자 범위형", value: "1-4 h" },
  { name: "재료", en: "Material", type: "선택형", value: "A / B" },
  { name: "속도", en: "Speed", type: "숫자 범위형", value: "200-800 rpm" },
];

const runs = [
  ["Run 1", "50 °C", "1 h", "A", "200 rpm"],
  ["Run 2", "50 °C", "4 h", "B", "800 rpm"],
  ["Run 3", "80 °C", "1 h", "B", "800 rpm"],
  ["Run 4", "65 °C", "2.5 h", "중간값 없음", "500 rpm"],
];

export default function Home() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#intro" aria-label="Coreacta DOE 홈으로 이동">
          Coreacta DOE
        </a>
        <nav aria-label="시안 섹션">
          <a href="#wizard">설정 흐름</a>
          <a href="#workspace">Workspace</a>
          <a href="#principles">원칙</a>
        </nav>
      </header>

      <section className="hero" id="intro">
        <div className="hero-copy">
          <span className="eyebrow">실험 최적화 도우미</span>
          <h1>조건 4개 이하만 고르면 실험표와 분석 흐름을 잡아드려요.</h1>
          <p>
            Coreacta DOE는 연구자가 바꿔볼 조건을 고르고 결과를 입력하면,
            어떤 조건이 결과에 영향을 주는지 차분하게 정리해주는 도구입니다.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#goal-screen">
              내 실험 최적화 시작하기
            </a>
            <span>목표는 비워두고 시작할 수도 있어요.</span>
          </div>
        </div>
        <div className="experiment-visual" aria-label="실험표와 분석 흐름 예시">
          <div className="visual-card active">
            <strong>1</strong>
            <span>조건 선택</span>
          </div>
          <div className="visual-line" />
          <div className="visual-card">
            <strong>8-11</strong>
            <span>실험 조합</span>
          </div>
          <div className="visual-line" />
          <div className="visual-card">
            <strong>결론</strong>
            <span>다음 조건 추천</span>
          </div>
        </div>
      </section>

      <section className="intro-strip" aria-label="서비스를 이해하는 순서">
        {steps.map((step, index) => (
          <div className="strip-step" key={step}>
            <span>{index + 1}</span>
            {step}
          </div>
        ))}
      </section>

      <section className="screen-section" id="goal-screen">
        <div className="section-heading">
          <span className="step-label">첫 화면</span>
          <h2>먼저 목표를 한 문장으로 말해요.</h2>
          <p>
            서비스 설명은 한 문장으로 줄이고, 사용자가 바로 시작할 수 있는
            입력 하나만 중앙에 둡니다.
          </p>
        </div>
        <div className="mock-screen narrow">
          <div className="progress-dots" aria-hidden="true">
            <span className="on" />
            <span />
            <span />
            <span />
          </div>
          <h3>무엇을 더 좋게 만들고 싶나요?</h3>
          <p>예: 수율을 높이고 싶어요. 점도를 낮추고 싶어요.</p>
          <label className="goal-input">
            <span>실험 목표</span>
            <textarea placeholder="수율을 높이고 싶어요" />
          </label>
          <div className="suggestions">
            <button>수율 높이기</button>
            <button>점도 낮추기</button>
            <button>휘도 높이기</button>
          </div>
          <button className="primary-button full">조건 설정으로 이동</button>
        </div>
      </section>

      <section className="screen-section" id="wizard">
        <div className="section-heading">
          <span className="step-label">Wizard</span>
          <h2>한 화면에서는 조건 하나만 정해요.</h2>
          <p>
            DOE 용어보다 연구자가 쓰는 말을 먼저 보여주고, 설명은 사용자가
            필요할 때만 열어볼 수 있게 둡니다.
          </p>
        </div>
        <div className="mock-screen">
          <div className="flowbar">
            <span className="done">1 조건 수</span>
            <span className="current">2 조건 1</span>
            <span>3 조건 값</span>
            <span>4 결과</span>
          </div>
          <div className="wizard-layout">
            <aside>
              <strong>조건 1 / 4</strong>
              <p>결과에 영향을 줄 것 같은 조건을 하나 정해주세요.</p>
            </aside>
            <form className="condition-form">
              <label>
                <span>조건 유형</span>
                <div className="select-with-help">
                  <select defaultValue="range" aria-label="조건 유형">
                    <option value="range">숫자 범위형</option>
                    <option value="category">선택형</option>
                  </select>
                  <button type="button">설명</button>
                </div>
              </label>
              <label>
                <span>기본 조건</span>
                <select defaultValue="temperature" aria-label="기본 조건">
                  <option value="temperature">온도 / Temperature</option>
                  <option value="time">시간 / Time</option>
                  <option value="concentration">농도 / Concentration</option>
                </select>
              </label>
              <div className="two-cols">
                <label>
                  <span>조건명</span>
                  <input defaultValue="온도" />
                </label>
                <label>
                  <span>추천 영문명</span>
                  <input defaultValue="Temperature" />
                </label>
              </div>
              <button className="primary-button full" type="button">
                다음 조건 정하기
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="screen-section" id="workspace">
        <div className="section-heading">
          <span className="step-label">Workspace</span>
          <h2>실험표 확인, 결과 입력, 분석 확인 순서로 보여줘요.</h2>
          <p>
            프로젝트 관리 버튼은 조용하게 두고, 사용자가 지금 해야 할 행동만
            크게 보이게 합니다.
          </p>
        </div>
        <div className="workspace-preview">
          <div className="workspace-header">
            <div>
              <span className="step-label">수율 최적화</span>
              <h3>촉매 조건 테스트</h3>
              <p>측정 결과: 수율 · 목표: 크게 만들기</p>
            </div>
            <button className="quiet-button">더보기</button>
          </div>
          <div className="workspace-steps">
            <span className="current">1 먼저 아래의 실험표를 확인하세요</span>
            <span>2 측정 결과 입력</span>
            <span>3 분석 결과 확인</span>
          </div>
          <div className="workspace-grid">
            <section className="note-section">
              <div className="note-title">
                <div>
                  <span>DESIGN TABLE</span>
                  <h4>먼저 수행할 실험표</h4>
                </div>
                <button className="quiet-button">CSV</button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>온도</th>
                    <th>시간</th>
                    <th>재료</th>
                    <th>속도</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run[0]}>
                      {run.map((cell) => (
                        <td key={cell}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="note-section">
              <div className="note-title">
                <div>
                  <span>RESULTS INPUT</span>
                  <h4>측정 결과 입력</h4>
                </div>
              </div>
              <div className="result-list">
                {["Run 1", "Run 2", "Run 3", "Run 4"].map((run, index) => (
                  <label key={run}>
                    <span>{run}</span>
                    <input defaultValue={index === 0 ? "72" : ""} />
                  </label>
                ))}
              </div>
              <button className="primary-button full">결과 저장</button>
            </section>
          </div>
        </div>
      </section>

      <section className="screen-section" id="principles">
        <div className="section-heading">
          <span className="step-label">분석 화면 방향</span>
          <h2>차트보다 결론을 먼저 보여줘요.</h2>
          <p>
            어려운 용어는 한국어 설명을 먼저 쓰고, 영문 용어는 괄호 안에
            남겨 연구자가 필요할 때 확인할 수 있게 합니다.
          </p>
        </div>
        <div className="analysis-summary">
          <strong>현재 데이터에서는 온도가 수율에 가장 크게 영향을 주고 있어요.</strong>
          <ul>
            <li>영향이 큰 조건(driver): 온도, 시간</li>
            <li>휘어짐 확인(curvature): 중간값 실험을 더 확인해 보세요.</li>
            <li>다음 실험에서는 예상 결과가 가장 높은 #1 조건을 먼저 검토하세요.</li>
          </ul>
          <div className="condition-chips">
            {conditions.map((condition) => (
              <span key={condition.name}>
                {condition.name} · {condition.value}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
