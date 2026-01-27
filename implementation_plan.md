# Fix Amplify Build Configuration

The deployment failed because Amplify attempted to build from the root directory and didn't find the Next.js application, resulting in no artifacts (`index.html` missing).

## Solution
Create an `amplify.yml` build specification file in the root directory to tell Amplify:
1.  The application is in the `frontend` directory (`appRoot: frontend`).
2.  How to install dependencies (`npm ci`).
3.  How to build (`npm run build`).
4.  Where the artifacts are (`.next`).

## Proposed Changes

### Root
#### [NEW] [amplify.yml](file:///c:/git/meishigawarini/amplify.yml)
```yaml
version: 1
applications:
  - appRoot: frontend
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
```

## Verification
1.  Push `amplify.yml` to GitHub.
2.  Amplify should automatically trigger a new build.
3.  Verify the build logs show `frontend` directory entry and successful `next build`.
4.  Verify the site URL works.
