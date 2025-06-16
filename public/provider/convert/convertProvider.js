const { docxToHtml } = require('./docxToHtml');
const { docxToHtmlQuill } = require('./docxToHtmlQuill');

const mammoth = require('mammoth');

class ConvertProvider {
    static docxToHtml(docxFile) {
        return docxToHtml(docxFile);
    }
    static docxToHtmlQuill(docxFile) {
        return docxToHtmlQuill(docxFile);
    }
    static async mammothToHtml(docxFile) {
        const htmlContent =await mammoth.convertToHtml(docxFile);
        return htmlContent.value;
    }
}

module.exports = ConvertProvider