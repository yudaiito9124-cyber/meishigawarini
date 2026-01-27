# Admin: Custom QR Code Styling

Replace the standard `qrcode` library with `qr-code-styling` to support:
- "Dots" or "Rounded" style (丸の集合).
- Embedded center image (Logo).
- Custom colors (if needed).

## Changes

### Frontend
#### [MODIFY] [frontend/package.json](file:///c:/git/meishigawarini/frontend/package.json)
- Add `qr-code-styling`. (Done via command)

#### [MODIFY] [frontend/app/admin/page.tsx](file:///c:/git/meishigawarini/frontend/app/admin/page.tsx)
- Import `QRCodeStyling`.
- Update `generatePDF` function:
    - Instantiate `QRCodeStyling` for each code (or reuse and update data).
    - Configure `dotsOptions: { type: 'dots' }` for the "circle" look.
    - Configure `cornersSquareOptions: { type: 'extra-rounded' }`.
    - Configure `image` with a placeholder (e.g., `/logo.png` or a sample URL).
    - Use `getRawData('png')` to get the image blob.
    - Convert Blob to Base64 (helper function).
    - Pass Base64 to `doc.addImage`.

## Verification
1.  Reload Admin Page.
2.  Generate PDF.
3.  Check if QRs are "cute" (dots) and have a placeholder logo space (or handle missing logo gracefully).
