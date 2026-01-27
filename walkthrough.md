# Fix Blank Screen on Deployment

The blank screen issue was caused by the application throwing an error when environment variables were missing during initialization.

## Changes
- Modified `frontend/app/components/ConfigureAmplify.tsx` to handle missing environment variables safely.
- **[NEW] Added `amplify.yml`**: Configured Amplify to build the application from the `frontend` subdirectory, resolving the "No index.html detected" error.

## Verification
1.  **Wait for Amplify Build**: The changes have been pushed. The latest build (triggered by "chore: Add amplify.yml build config") should now succeed with a valid "Frontend Build" phase.
2.  **Check the Site**: Access the deployed URL.
    - **Success**: The site loads (Top page with "To get started...").
    - **Partial Success**: The site loads but shows a console warning about missing Auth vars (if env vars are still missing).
    - **Failure**: Still 404 or build fails (Check Build logs again).

## Next Steps
- Verify environment variables in Amplify Console -> App Settings -> Environment variables.

