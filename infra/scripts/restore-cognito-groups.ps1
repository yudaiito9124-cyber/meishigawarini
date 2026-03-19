# Restore-CognitoGroups.ps1
param (
    [Parameter(Mandatory=$true)]
    [string]$UserPoolId,
    [Parameter(Mandatory=$true)]
    [string]$BackupFile
)

$backup = Get-Content $BackupFile | ConvertFrom-Json
$region = ($UserPoolId -split "_")[0]

foreach ($group in $backup) {
    echo "Restoring group: $($group.GroupName)"
    
    # Try to ensure group exists
    try {
        aws cognito-idp create-group --user-pool-id $UserPoolId --group-name $group.GroupName --description $group.Description --region $region 2>$null
    } catch {
        # Already exists, that's fine
    }

    # Add members
    foreach ($username in $group.Members) {
        echo "Adding user $username to group $($group.GroupName)"
        aws cognito-idp admin-add-user-to-group --user-pool-id $UserPoolId --group-name $group.GroupName --username $username --region $region
    }
}

echo "Restoration complete."
