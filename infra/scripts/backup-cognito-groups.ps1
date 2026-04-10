<#
.SYNOPSIS
    Cognito ユーザープールのグループ定義を JSON 形式でバックアップします。
.DESCRIPTION
    UserPool 内の全グループ情報を取得し、JSON ファイルとして出力します。
    Administrators や GlobalAdmins 等の権限設計を保持するために使用します。
.PARAMETER UserPoolId
    バックアップ対象の AWS Cognito User Pool ID。
#>
param (
    [Parameter(Mandatory=$true)]
    [string]$UserPoolId
)

$region = ($UserPoolId -split "_")[0]
$groups = aws cognito-idp list-groups --user-pool-id $UserPoolId --region $region | ConvertFrom-Json

$backup = @()

foreach ($group in $groups.Groups) {
    echo "Backing up group: $($group.GroupName)"
    $members = aws cognito-idp list-users-in-group --user-pool-id $UserPoolId --group-name $group.GroupName --region $region | ConvertFrom-Json
    $backup += [PSCustomObject]@{
        GroupName = $group.GroupName
        Description = $group.Description
        Members = $members.Users.Username
    }
}

$outputFile = "cognito_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
$backup | ConvertTo-Json -Depth 5 | Out-File $outputFile
echo "Backup saved to $outputFile"
