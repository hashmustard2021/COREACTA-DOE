# Coreacta DOE

Coreacta DOE는 실험 조건과 측정 결과를 바탕으로 8-run fractional factorial DOE 설계, 결과 분석, 다음 실험 조건 추천을 제공하는 웹 애플리케이션입니다.

## 기술 스택

- Backend: Python 3.11, Django, Django REST Framework
- Frontend: Next.js 13, React, TypeScript, Recharts
- Database: SQLite(로컬), PostgreSQL(Render)
- Deployment: Docker, Gunicorn, WhiteNoise, Render

## 로컬 실행

```powershell
cd "C:\projects\Coreacta-doe Codex"
poetry install
npm install
poetry run python manage.py migrate
```

Backend:

```powershell
poetry run python manage.py runserver
```

Frontend는 별도 PowerShell에서 실행합니다.

```powershell
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Admin: http://localhost:8000/admin/

## 주요 API

모든 DOE API는 SessionAuthentication을 사용하며 로그인한 프로젝트 소유자만 접근할 수 있습니다.

| Method | Path | 기능 |
| --- | --- | --- |
| GET | `/api/health/` | 배포 상태 확인(인증 불필요) |
| POST | `/api/auth/login/` | 로그인 |
| POST | `/api/auth/logout/` | 로그아웃 |
| GET/POST | `/api/projects/` | 프로젝트 목록/생성 |
| GET/PATCH/DELETE | `/api/projects/{id}/` | 프로젝트 상세/수정/삭제 |
| POST | `/api/projects/{id}/design/` | DOE 설계 생성 |
| POST | `/api/projects/{id}/results/` | 결과 입력/수정 |
| GET | `/api/projects/{id}/report/` | 분석 리포트 |
| GET | `/api/projects/{id}/surface/` | response surface 데이터 |
| GET | `/api/projects/{id}/design.csv/` | CSV 다운로드 |
| GET | `/api/projects/{id}/report.pdf/` | PDF 다운로드 |
| GET | `/api/projects/{id}/result-history/` | 결과 수정 이력 |

## DOE 로직

- A, B, C는 2수준 전체 조합을 사용합니다.
- 네 번째 조건은 `D = A × B × C`로 생성합니다.
- 숫자 범위형은 `-1 → 최소값`, `+1 → 최대값`으로 변환합니다.
- 선택형은 `-1 → 첫 번째 선택값`, `+1 → 두 번째 선택값`으로 변환합니다.
- Main effect는 `mean(Y | HIGH) - mean(Y | LOW)`로 계산합니다.
- 결과가 충분하면 예측 모델과 후보 grid로 다음 실험 조건 3개를 추천하고, 부족하면 rule-based 추천으로 대체합니다.

## 환경변수

`.env.example`을 기준으로 로컬 환경을 설정합니다. `.env` 파일은 Git에 커밋하지 않습니다.

운영 필수값:

- `DJANGO_SECRET_KEY`: 충분히 긴 무작위 값
- `DJANGO_DEBUG=false`
- `DATABASE_URL`: Render PostgreSQL connection string
- `DJANGO_ALLOWED_HOSTS`: Render 외부 호스트(선택, Render에서는 자동 감지)
- `DJANGO_CSRF_TRUSTED_ORIGINS`: HTTPS origin(선택, Render에서는 자동 감지)
- `NEXT_PUBLIC_API_BASE_URL`: 단일 도메인 빌드에서는 빈 문자열

## Render 무료 데모 배포

1. GitHub 저장소의 `main` 브랜치에 배포 코드를 push합니다.
2. Render Dashboard에서 **New > Blueprint**를 선택합니다.
3. `hashmustard2021/COREACTA-DOE` 저장소를 연결합니다.
4. Render가 `render.yaml`을 읽어 Docker Web Service와 PostgreSQL을 생성하는지 확인합니다.
5. 첫 배포가 완료되면 `/api/health/`에서 `success: true` 응답을 확인합니다.
6. Render Shell에서 관리자를 생성합니다.

```bash
python manage.py createsuperuser
```

7. 플랫폼 URL에서 로그인, 프로젝트 생성, 설계, 결과, 리포트, CSV/PDF 다운로드를 확인합니다.

> Render 무료 서비스는 절전, 느린 첫 요청, 데이터베이스 보존 제한이 있을 수 있습니다. 복구 불가능한 연구 데이터는 저장하지 말고 Render의 현재 무료 플랜 정책을 배포 시점에 확인하세요.

## 검증 명령

```powershell
poetry run python manage.py check
poetry run python manage.py test doe
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

운영 설정 검사:

```powershell
$env:DJANGO_DEBUG="false"
$env:DJANGO_SECRET_KEY="replace-with-a-long-random-secret-for-check-only"
$env:DJANGO_ALLOWED_HOSTS="example.onrender.com"
$env:DJANGO_CSRF_TRUSTED_ORIGINS="https://example.onrender.com"
poetry run python manage.py check --deploy
```
