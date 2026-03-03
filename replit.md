# Smart School - 스마트 스쿨 학교 관리 플랫폼

## Overview
학교종이, e알리미, 아이엠스쿨을 대체하는 차세대 학교 관리 플랫폼입니다.

### 주요 기능
1. **결재 시스템**: 가정체험학습 신청서, 보고서, 결석계, 전학신청서 작성 및 담임/교감 결재
2. **AI 도구**: 
   - 설문지 자동 생성 (이미지/프롬프트 기반)
   - 교육과정 설계 (마인드맵 → 시수, 성취기준, 평가)
   - 보고서/계획서 자동 생성
3. **캘린더**: 학사일정 관리 (월간/전체 뷰)
4. **월중계획**: 스프레드시트 형태의 월별 일정 관리
   - 학사일정/업무일정 자동 표시
   - 출장, 회의, 안내 셀 실시간 공동 편집 (교직원/교사/교감/교장만)
   - 회의/안내 셀 주별(일~토) rowSpan 병합 구현
5. **채팅**: 학급별, 전체, 1:1 대화
   - 채널 목록에 참여자 수 표시
   - 대화방 헤더에 참여자 수 표시 (클릭 시 참여자 목록)
   - 이모티콘 반응 (클릭 기반 선택, 반응자 목록 보기)
   - 읽음 확인 (눈 아이콘으로 읽은 수 표시, 클릭 시 읽은 사람 목록)
6. **스토리/게시판**: 학교 행사 기록

## Tech Stack
- Frontend: React + Vite + TailwindCSS + Shadcn/UI
- Backend: Express + Node.js
- Database: PostgreSQL (Drizzle ORM)
- Auth: Replit Auth (OpenID Connect)
- AI: OpenAI via Replit AI Integrations (별도 API 키 불필요)

## Current State
- MVP 완료
- 인증 시스템 구현 완료
- 결재, 설문, 캘린더, 채팅, 게시판 기본 기능 구현

## Future Enhancements
- **Google Calendar 연동**: 관리자 페이지에서 학사/업무 캘린더 설정 UI 구현 완료
  - 현재: 앱 내부 캘린더 사용, 설정 UI 준비됨
  - 향후: connector:ccfg_google-calendar_DDDBAC03DE404369B74F32E78D 연동 완료 시 자동 동기화 활성화
  - 데이터베이스: calendar_settings 테이블에 캘린더 ID 및 동기화 설정 저장
  - API: /api/admin/calendar-settings (GET/POST), /api/calendar/sync (POST)

## Project Structure
```
client/           # Frontend (React + Vite)
  src/
    components/   # UI 컴포넌트
    pages/        # 페이지 컴포넌트
    hooks/        # Custom hooks (useAuth 등)
server/           # Backend (Express)
  routes.ts       # API 라우트
  storage.ts      # 데이터베이스 레이어
  db.ts           # Drizzle 연결
  replit_integrations/  # Auth, Chat, Image AI 통합
shared/           # 공유 타입/스키마
  schema.ts       # Drizzle 스키마
  routes.ts       # API 계약 (Zod)
```

## User Preferences
- 한국어 UI/UX 선호
- 교육 관련 용어 사용

## API Endpoints
- `/api/approvals` - 결재 요청 CRUD
- `/api/surveys` - 설문 관리
- `/api/events` - 캘린더 이벤트
- `/api/posts` - 게시글/공지
- `/api/channels` - 채팅 채널
- `/api/ai/generate-survey` - AI 설문 생성
- `/api/ai/generate-curriculum` - AI 교육과정 생성
- `/api/ai/generate-report` - AI 보고서 생성
