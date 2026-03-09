const DOMPurify = require('isomorphic-dompurify');

const dirty = `<style>.product-card { color: red; }</style><div class="product-card">Test</div><iframe src="..."></iframe>`;

const clean = DOMPurify.sanitize(dirty, {
    ADD_TAGS: ['iframe', 'style'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
});

console.log(clean);
