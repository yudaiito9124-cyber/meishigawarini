const fs = require('fs');
const { jsPDF } = require('jspdf');

try {
    const doc = new jsPDF();
    const fontData = fs.readFileSync('frontend/public/NotoSansJP-Variable.ttf').toString('base64');
    doc.addFileToVFS('NotoSansJP.ttf', fontData);
    doc.addFont('NotoSansJP.ttf', 'NotoSansJP', 'normal');
    doc.setFont('NotoSansJP');
    doc.text('こんにちは世界', 10, 10);
    doc.save('test_font.pdf');
    console.log('PDF generated successfully');
} catch (e) {
    console.error('Failed to generate PDF:', e);
}
