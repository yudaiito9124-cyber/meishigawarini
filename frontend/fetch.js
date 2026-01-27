const { execSync } = require('child_process');
try {
    const output = execSync('aws cloudformation describe-stacks --stack-name InfraStack --query "Stacks[0].Outputs" --output json', { encoding: 'utf8' });
    console.log(output);
} catch (e) {
    console.error(e.message);
}
