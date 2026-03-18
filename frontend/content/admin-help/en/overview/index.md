---
title: Admin Help: Overview
---

# Meshigawarini Admin Documentation

This section is dedicated to system administrators. It explains how to manage the system and details of each feature.

## Dashboard Overview

The administrator dashboard is divided into several key sections:

- **QR Code Management**: Batch generation of QR codes, PDF downloads, and status tracking (including banning).
- **Card Design Editor**: Manage card designs (colors, fonts, background images) used by users.
- **Shop & Owner Management**: Register new shops, change shop owners, and link managers.
- **System Tools**: Dump various system data for backup and analysis purposes.

## QR Code Generation Steps

1. **Set Quantity**: Enter the number of QR codes to generate.
2. **Assign Metadata**: (Optional) Set shop IDs, expiry dates, or immediate activation flags.
3. **Select Card Design**: Choose the default design template for the batch.
4. **Execute Generation**: Click "Generate" to create unique UUIDs and PINs. A PDF will be downloaded automatically.

> [!IMPORTANT]
> Generated PDFs cannot be re-issued for security reasons. Please store downloaded files safely.

## Security Controls

All administrative actions are logged. Access is restricted to users with **Administrators** or **GlobalAdmins** groups. Multi-Factor Authentication (MFA) is strictly enforced.
