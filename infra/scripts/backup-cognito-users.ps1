<#
.SYNOPSIS
    Cognito ユーザープールの全ユーザーを JSON 形式でバックアップします。
.DESCRIPTION
    指定された UserPoolId に属するすべてのユーザー情報を取得し、
    タイムスタンプ付きの JSON ファイルとしてローカルに保存します。
    不慮のデータ消失や、ステージ間でのデータ移行前のスナップショットとして使用します。
.PARAMETER UserPoolId
    バックアップ対象の AWS Cognito User Pool ID（例：ap-northeast-1_xxxxxxxxx）。
.EXAMPLE
    .\backup-cognito-users.ps1 -UserPoolId "ap-northeast-1_xxxxxxxxx"
#>
param (
    [Parameter(Mandatory=$true)]
    [string]$UserPoolId
)

$region = ($UserPoolId -split "_")[0]
echo "Backing up all users in pool $UserPoolId (Region: $region)..."

$users = aws cognito-idp list-users --user-pool-id $UserPoolId --region $region | ConvertFrom-Json

$outputFile = "cognito_users_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
$users.Users | ConvertTo-Json -Depth 5 | Out-File $outputFile

echo "Backup of $($users.Users.Count) users saved to $outputFile"
