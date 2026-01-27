const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('aws', ['cloudformation', 'describe-stacks', '--stack-name', 'InfraStack', '--query', 'Stacks[0].Outputs', '--output', 'json', '--no-cli-pager'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: true
});

let data = '';
child.stdout.on('data', chunk => {
    data += chunk.toString();
});

child.on('close', (code) => {
    console.log(`Exited with code ${code}`);
    fs.writeFileSync('clean_outputs.json', data, { encoding: 'utf8' });
});
