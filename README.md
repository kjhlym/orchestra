이 프로젝트는 [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)으로 생성한 [Next.js](https://nextjs.org) 애플리케이션입니다.

## 시작하기

먼저 개발 서버를 실행하세요.

```bash
npm run dev
# 또는
yarn dev
# 또는
pnpm dev
# 또는
bun dev
```

[http://localhost:3000](http://localhost:3000)을 브라우저에서 열면 결과를 확인할 수 있습니다.

`src/app/page.tsx`를 수정하면 페이지 편집을 시작할 수 있으며, 파일 저장 시 자동으로 반영됩니다.

이 프로젝트는 [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)를 사용해 [Geist](https://vercel.com/font) 글꼴을 자동으로 최적화하고 로드합니다.

## 검증하기

로컬에서 변경을 확인할 때는 아래 명령을 사용할 수 있습니다.

```bash
npm run lint
npm run smoke:critic
npm run smoke:planner
npm run smoke:designer
npm run smoke:tester
npm run check
```

`npm run check`는 임시 개발 서버를 띄운 뒤 `critic` 스모크를 실행하고, 이어서 `planner`/`designer`/`tester` 회귀를 돌린 뒤 서버를 정리합니다.

## 환경 변수

자동 생성 작업 폴더와 구조 생성을 사용하려면 아래 환경 변수를 설정하세요.

```bash
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
ORCHESTRA_PROJECTS_ROOT="../orchestra_projects"
```

`.env.example`를 참고해 `.env`를 구성할 수 있습니다.
`DATABASE_URL`은 로컬 개발에서는 비워도 되며, 그 경우 기본값 `file:./dev.db`를 사용합니다. 배포/CI 환경에서는 반드시 명시해야 합니다.
Gemini 키를 교체하거나 새로 발급했다면 개발 서버를 다시 시작해야 반영됩니다.
생성된 새 프로젝트는 기본적으로 `../orchestra_projects` 아래에 독립 작업 폴더로 작성됩니다. `ORCHESTRA_PROJECTS_ROOT`로 경로를 바꿀 수 있습니다.

## 더 알아보기

Next.js에 대해 더 알아보려면 아래 자료를 참고하세요.

- [Next.js 문서](https://nextjs.org/docs) - Next.js 기능과 API를 설명합니다.
- [Learn Next.js](https://nextjs.org/learn) - 인터랙티브한 Next.js 튜토리얼입니다.

[Next.js GitHub 저장소](https://github.com/vercel/next.js)도 확인할 수 있습니다. 피드백과 기여를 환영합니다.

## Vercel 배포

Next.js 앱을 가장 쉽게 배포하는 방법은 제작사에서 제공하는 [Vercel 플랫폼](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)을 사용하는 것입니다.

[Next.js 배포 문서](https://nextjs.org/docs/app/building-your-application/deploying)에서 자세한 내용을 확인할 수 있습니다.
