# Admin: QR Code Banning

Enable administrators to completely invalidate a QR code, setting its status to `BANNED`. A banned QR code rejects all operations (link, activate, use).

## Proposed Changes

### Backend
#### [NEW] [infra/lambda/admin-update.ts](file:///c:/git/meishigawarini/infra/lambda/admin-update.ts)
- Create a new Lambda function to handle admin updates.
- POST /admin/qrcodes/{uuid}/ban
- Updates QR status to `BANNED`.
- Sets `GSI1_PK` to `QR#BANNED`.

#### [MODIFY] [infra/lib/infra-stack.ts](file:///c:/git/meishigawarini/infra/lib/infra-stack.ts)
- Define `AdminUpdateFn`.
- Grant read/write access to DynamoDB.
- Add API Gateway resource: `POST /admin/qrcodes/{uuid}/ban`.

### Frontend
#### [MODIFY] [frontend/app/admin/page.tsx](file:///c:/git/meishigawarini/frontend/app/admin/page.tsx)
- Add "Ban" button to the QR code list table.
- Implement `handleBan(uuid)` function to call the new API.
- Update UI to show `BANNED` status (red badge).

## Verification
1.  Deploy Backend.
2.  Frontend: Generates QRs.
3.  Click "Ban" on a QR.
4.  Try to link that QR in Shop Dashboard -> Should fail with "Operation failed" (ConditionalCheckFailed).
