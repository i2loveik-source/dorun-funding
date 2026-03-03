# Smart School Hub 배포 가이드

이 문서는 스마트 스쿨 프로젝트를 실제 운영 환경(Production)으로 배포하기 위한 단계별 안내서입니다.

## 1. 준비물
*   **저장소**: 깃허브(GitHub)에 최신 코드가 푸시되어 있어야 합니다.
*   **데이터베이스**: 원격 PostgreSQL 데이터베이스 (추천: [Supabase](https://supabase.com) 또는 [Neon](https://neon.tech))
*   **호스팅**: Node.js 앱을 실행할 서버 (추천: [Railway](https://railway.app), [Render](https://render.com), [Vercel](https://vercel.com))

## 2. 배포 단계

### 단계 1: 원격 데이터베이스 생성
1.  Supabase 또는 Neon에서 새로운 프로젝트를 생성합니다.
2.  제공되는 **PostgreSQL Connection String (DATABASE_URL)**을 복사해 둡니다.
    *   형식: `postgresql://user:password@host:port/dbname`

### 단계 2: 호스팅 서비스 연결
1.  선택한 호스팅 서비스(예: Railway)에서 "New Project" -> "GitHub Repo"를 선택합니다.
2.  `Smart-School-Hub` 저장소를 연결합니다.

### 단계 3: 환경 변수(Environment Variables) 설정
호스팅 서비스의 설정(Settings/Variables) 메뉴에서 다음 변수들을 등록합니다:
*   `NODE_ENV`: `production`
*   `DATABASE_URL`: (단계 1에서 복사한 주소)
*   `SESSION_SECRET`: (아무 긴 문자열 - 세션 보안용)
*   `OPENAI_API_KEY`: (AI 기능을 위한 키)
*   `PORT`: `5001` (또는 서비스에서 지정한 값)

### 단계 4: 빌드 및 시작 명령어 확인
서비스 설정에서 다음 명령어가 올바르게 입력되었는지 확인합니다:
*   **Build Command**: `npm install && npm run build`
*   **Start Command**: `npm run start` (또는 `node dist/index.cjs`)

### 단계 5: DB 스키마 생성
첫 배포 후 데이터베이스 테이블을 생성하기 위해 로컬 터미널에서 다음을 실행합니다 (원격 DB URL이 로컬 .env에 있어야 함):
```bash
npm run db:push
```

## 3. 사후 관리
*   배포된 URL로 접속하여 회원가입 및 기능을 테스트합니다.
*   로그를 확인하여 에러가 발생하는지 모니터링합니다.
