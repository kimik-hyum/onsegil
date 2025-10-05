# Onsegil Monorepo (Yarn v3+)

이 레포는 Yarn Berry(3 이상, 기본적으로 4 사용) 기반의 워크스페이스 모노레포입니다.

## 빠른 시작

1) Corepack 활성화 (Node 16.10+ 권장, Node 18+ 추천)
   - `corepack enable`

2) Yarn 버전 준비/활성화 (레포에 선언된 버전 사용)
   - `corepack prepare yarn@^4 --activate`
   - 또는 전역에 이미 Yarn Berry가 있다면 생략 가능합니다.

3) 의존성 설치
   - `yarn install`

4) 스크립트 예시
   - 전체 빌드: `yarn build`
   - 전체 테스트: `yarn test`

## 구조

- 루트 설정: Yarn 워크스페이스(`package.json`), `.yarnrc.yml`
- 워크스페이스: `packages/*`
- 예시 패키지: `packages/example`

## 메모

- 현재 `.yarnrc.yml`은 `nodeLinker: node-modules`로 설정되어 있어 일반적인 Node 생태계와 호환성이 좋습니다. 필요시 PnP로 변경 가능합니다.
- 레포에 Yarn 바이너리를 고정하고 싶다면 `yarn set version stable`을 실행해 생성되는 `.yarn/releases/*`를 커밋하세요.
