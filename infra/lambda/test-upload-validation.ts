
// Mock strict validation test
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function validate(contentType: string) {
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return 'Invalid content type. Only images are allowed.';
    }
    return 'OK';
}

console.log('Testing valid types:');
console.log('image/jpeg:', validate('image/jpeg'));
console.log('image/png:', validate('image/png'));

console.log('\nTesting invalid types:');
console.log('text/html:', validate('text/html'));
console.log('application/javascript:', validate('application/javascript'));
console.log('application/pdf:', validate('application/pdf'));
console.log('image/svg+xml:', validate('image/svg+xml')); // SVG can contain scripts
