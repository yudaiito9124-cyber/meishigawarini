
// Mock strict validation test
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

function validate(filename: string, contentType: string) {
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return `Invalid content type: ${contentType}`;
    }
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        return `Invalid extension: ${ext}`;
    }
    return 'OK';
}

console.log('Testing valid types:');
console.log('image.jpg (image/jpeg):', validate('image.jpg', 'image/jpeg'));
console.log('image.png (image/png):', validate('image.png', 'image/png'));

console.log('\nTesting invalid types:');
console.log('image.heic (image/heic):', validate('image.heic', 'image/heic')); // Should fail now
console.log('script.html (text/html):', validate('script.html', 'text/html'));
