# Restore-CognitoUsers.ps1
param (
    [Parameter(Mandatory=$true)]
    [string]$UserPoolId,
    [Parameter(Mandatory=$true)]
    [string]$BackupFile
)

$users = Get-Content $BackupFile | ConvertFrom-Json
$region = ($UserPoolId -split "_")[0]

foreach ($user in $users) {
    # Extract email from attributes to use as the creation username for email-based pools
    $email = ($user.Attributes | Where-Object { $_.Name -eq "email" }).Value
    $usernameToCreate = if ($email) { $email } else { $user.Username }

    echo "Restoring user: $($usernameToCreate) (Original Username: $($user.Username))"
    
    # Prepare attributes (removing system-only and duplicated email attributes)
    $attrs = $user.Attributes | Where-Object { $_.Name -ne "sub" -and $_.Name -ne "email_verified" -and $_.Name -ne "phone_number_verified" -and $_.Name -ne "email" }
    $attrString = ""
    foreach ($attr in $attrs) {
        $attrString += "Name=$($attr.Name),Value='$($attr.Value)' "
    }

    # Create user
    try {
        aws cognito-idp admin-create-user --user-pool-id $UserPoolId --username $usernameToCreate --user-attributes $attrString --region $region
        echo "User $($usernameToCreate) created. They will need to reset their password."
    } catch {
        echo "Failed to restore user $($usernameToCreate): $_"
    }
}

echo "User restoration complete."
