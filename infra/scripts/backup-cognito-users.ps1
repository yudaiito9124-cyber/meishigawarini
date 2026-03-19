# Backup-CognitoUsers.ps1
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
