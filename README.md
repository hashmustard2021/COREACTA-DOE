# Coreacta DOE

Coreacta DOE는 유기합성 반응 최적화를 위한 Django + Django REST Framework 기반 DOE(Design of Experiments) 백엔드 MVP입니다.

현재 v1은 최대 4개 factor를 사용하는 8-run fractional factorial DOE를 지원합니다. 프로젝트 생성, DOE 설계 생성, 결과 입력, 리포트 조회, 설계 CSV 다운로드 API를 제공합니다.

## 기술 스택

- Python 3.11+
- Django 5
- Django REST Framework
- SQLite
- Poetry

## Poetry 설치 및 실행 방법

프로젝트 폴더로 이동합니다.

```powershell
cd "C:\projects\Coreacta-doe Codex"
```

의존성을 설치합니다.

```powershell
poetry install
```

Django 명령은 Poetry 가상환경 안에서 실행합니다.

```powershell
poetry run python manage.py check
```

## Migration 방법

모델 변경사항이 있는지 확인하고 migration 파일을 생성합니다.

```powershell
poetry run python manage.py makemigrations
```

DB에 migration을 적용합니다.

```powershell
poetry run python manage.py migrate
```

관리자 계정이 필요하면 생성합니다.

```powershell
poetry run python manage.py createsuperuser
```

## Runserver 실행 방법

```powershell
poetry run python manage.py runserver
```

기본 서버 주소:

```text
http://127.0.0.1:8000/
```

Django admin:

```text
http://127.0.0.1:8000/admin/
```

## API 목록

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/api/projects/` | 프로젝트와 factor 생성 |
| POST | `/api/projects/{project_id}/design/` | 8-run DOE 설계 생성 |
| GET | `/api/projects/{project_id}/design.csv/` | DOE 설계와 yield를 CSV로 다운로드 |
| POST | `/api/projects/{project_id}/results/` | run 결과 입력 또는 수정 |
| GET | `/api/projects/{project_id}/report/` | main effect, top drivers, next run recommendation 조회 |

## 테스트용 curl 예시

아래 예시는 Windows PowerShell에서 `curl.exe`로 실행하는 형식입니다.

### 1. 프로젝트 생성

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/projects/" `
  -H "Content-Type: application/json; charset=utf-8" `
  -d "{\"name\":\"Suzuki coupling optimization\",\"description\":\"DOE test\",\"factors\":[{\"idx\":1,\"name_kr\":\"온도\",\"name_en\":\"Temperature\",\"unit\":\"°C\",\"low\":\"60\",\"high\":\"90\"},{\"idx\":2,\"name_kr\":\"시간\",\"name_en\":\"Time\",\"unit\":\"h\",\"low\":\"1\",\"high\":\"4\"},{\"idx\":3,\"name_kr\":\"촉매량\",\"name_en\":\"Catalyst loading\",\"unit\":\"mol%\",\"low\":\"0.5\",\"high\":\"5\"},{\"idx\":4,\"name_kr\":\"농도\",\"name_en\":\"Concentration\",\"unit\":\"M\",\"low\":\"0.05\",\"high\":\"0.30\"}]}"
```

응답의 `id` 값을 이후 `{project_id}`로 사용합니다.

### 2. DOE 설계 생성

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/projects/{project_id}/design/"
```

### 3. 결과 입력

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/projects/{project_id}/results/" `
  -H "Content-Type: application/json" `
  -d "{\"run_order\":1,\"response\":\"42\",\"note\":\"test run 1\"}"
```

8개 run을 모두 입력하려면 `run_order`와 `response`를 바꿔 반복 호출합니다.

```text
Run 1: 42
Run 2: 55
Run 3: 48
Run 4: 51
Run 5: 46
Run 6: 58
Run 7: 53
Run 8: 61
```

### 4. 리포트 조회

```powershell
curl.exe "http://127.0.0.1:8000/api/projects/{project_id}/report/"
```

### 5. CSV 다운로드

```powershell
curl.exe "http://127.0.0.1:8000/api/projects/{project_id}/design.csv/" `
  -o "design.csv"
```

CSV는 Excel에서 한글이 깨지지 않도록 UTF-8 BOM이 포함된 `utf-8-sig`로 응답합니다.

## DOE v1 로직

### 8-run fractional factorial

v1은 최대 4개 factor를 지원합니다. factor는 `idx` 순서대로 A, B, C, D에 매핑됩니다.

```text
idx 1 -> A
idx 2 -> B
idx 3 -> C
idx 4 -> D
```

A, B, C는 2수준 전체 조합인 `2^3 = 8`개 run으로 생성합니다.

```text
(-1, -1, -1)
(-1, -1, +1)
(-1, +1, -1)
(-1, +1, +1)
(+1, -1, -1)
(+1, -1, +1)
(+1, +1, -1)
(+1, +1, +1)
```

D는 generator 규칙으로 계산합니다.

```text
D = A x B x C
```

각 level은 factor 값으로 변환됩니다.

```text
-1 -> low
+1 -> high
```

### Main effect 계산식

각 factor의 main effect는 HIGH 조건 평균과 LOW 조건 평균의 차이로 계산합니다.

```text
effect = mean(Y | HIGH) - mean(Y | LOW)
```

해석:

```text
effect > 0  -> HIGH 방향이 유리
effect < 0  -> LOW 방향이 유리
effect = 0  -> NEUTRAL
```

결과가 부족해서 HIGH 또는 LOW 평균을 계산할 수 없으면 `effect`는 `None`입니다. 리포트의 top drivers는 `effect`가 `None`이 아닌 항목만 사용하고, `abs(effect)` 기준 내림차순으로 정렬합니다.

### Next run recommendation 규칙

추천 조건은 유효한 effect가 2개 이상일 때만 생성합니다. 유효한 effect가 2개 미만이면 데이터 부족 메시지를 반환합니다.

추천 생성 순서:

1. `effect is not None`인 항목만 `valid_effects`로 사용합니다.
2. `abs(effect)` 기준 상위 2개 factor를 `top1`, `top2`로 선택합니다.
3. 추천 1은 `top1`, `top2`의 유리한 방향을 그대로 사용합니다.
4. 추천 2는 `top1`만 반대 방향으로 바꾸고 `top2`는 유지합니다.
5. 추천 3은 `top2`만 반대 방향으로 바꾸고 `top1`은 유지합니다.

방향 전환 규칙:

```text
HIGH -> LOW
LOW -> HIGH
NEUTRAL -> NEUTRAL
```

값 선택 규칙:

```text
HIGH -> factor.high
LOW -> factor.low
NEUTRAL -> midpoint = (low + high) / 2
```

추천에서 top driver가 아닌 factor는 `NEUTRAL`로 두고 midpoint 값을 사용합니다.
