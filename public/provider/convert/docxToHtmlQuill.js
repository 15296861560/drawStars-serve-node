/**
 * docxToHtmlQuill.js - 将Word文档(.docx)转换为HTML适配Quill
 */

const AdmZip = require('adm-zip');
const { xml2js } = require('xml-js');
const path = require('path');
const fs = require('fs');

/**
 * 将docx文件转换为HTML
 * @param {Buffer|String} docxFile - docx文件的Buffer或文件路径
 * @returns {Object} - 包含HTML内容和媒体文件的对象
 */
async function docxToHtmlQuill(docxFile) {
    try {
        // 处理输入，支持文件路径或Buffer
        let buffer;
        if (typeof docxFile === 'string') {
            buffer = fs.readFileSync(docxFile);
        } else {
            buffer = docxFile;
        }

        // 解压docx文件
        const zip = new AdmZip(buffer);

        // 提取关键XML文件
        const documentXml = zip.getEntry('word/document.xml');
        const stylesXml = zip.getEntry('word/styles.xml');
        const numberingXml = zip.getEntry('word/numbering.xml');
        const relationshipsXml = zip.getEntry('word/_rels/document.xml.rels');

        if (!documentXml) {
            throw new Error('无效的Word文档: 找不到document.xml');
        }

        // 将XML转换为JavaScript对象 - 使用非压缩模式
        const documentContent = documentXml.getData().toString('utf8');
        const documentObj = xml2js(documentContent, { compact: false });

        let stylesObj = null;
        if (stylesXml) {
            const stylesContent = stylesXml.getData().toString('utf8');
            stylesObj = xml2js(stylesContent, { compact: false });
        }

        let numberingObj = null;
        if (numberingXml) {
            const numberingContent = numberingXml.getData().toString('utf8');
            numberingObj = xml2js(numberingContent, { compact: false });
        }

        // 解析关系映射
        const relationships = {};
        if (relationshipsXml) {
            const relationshipsContent = relationshipsXml.getData().toString('utf8');
            try {
                const relationshipsObj = xml2js(relationshipsContent, { compact: false });

                if (relationshipsObj && relationshipsObj.elements && relationshipsObj.elements[0]) {
                    const relsElement = relationshipsObj.elements[0];
                    if (relsElement.elements) {
                        relsElement.elements.forEach(rel => {
                            if (rel.attributes) {
                                const id = rel.attributes.Id;
                                const target = rel.attributes.Target;
                                const type = rel.attributes.Type || '';

                                if (id && target) {
                                    relationships[id] = {
                                        target: target,
                                        type: type
                                    };
                                }
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('解析关系映射失败:', error);
            }
        }

        // 提取媒体文件
        const mediaFiles = {};
        const mediaEntries = zip.getEntries().filter(entry =>
            entry.entryName.startsWith('word/media/')
        );

        for (const entry of mediaEntries) {
            const fileName = path.basename(entry.entryName);
            mediaFiles[fileName] = entry.getData();
        }

        // 检查媒体文件
        if (Object.keys(mediaFiles).length === 0) {
            console.warn('未发现媒体文件，检查是否有其他位置的资源');
            // 尝试查找其他可能包含媒体的位置
            zip.getEntries().forEach(entry => {
                if (entry.entryName.match(/\.(png|jpe?g|gif|bmp|tiff?|wmf|emf|svg)$/i)) {
                    const fileName = path.basename(entry.entryName);
                    mediaFiles[fileName] = entry.getData();
                    console.log(`从非媒体文件夹找到图片: ${entry.entryName}`);
                }
            });
        }

        // 提取图表数据
        const chartData = {};
        const chartEntries = zip.getEntries().filter(entry =>
            entry.entryName.startsWith('word/charts/')
        );

        // 收集所有图表相关的XML
        for (const entry of chartEntries) {
            const chartId = entry.entryName;
            try {
                const chartContent = entry.getData().toString('utf8');
                const chartObj = xml2js(chartContent, { compact: false });
                chartData[chartId] = chartObj;
            } catch (error) {
                console.error(`解析图表失败 ${chartId}:`, error);
            }
        }

        // 查找图表关系文件，其中包含图表的数据引用
        const chartRelationships = {};
        zip.getEntries().forEach(entry => {
            if (entry.entryName.startsWith('word/charts/_rels/') && entry.entryName.endsWith('.xml.rels')) {
                try {
                    const chartRelContent = entry.getData().toString('utf8');
                    const chartRelObj = xml2js(chartRelContent, { compact: false });
                    if (chartRelObj && chartRelObj.elements && chartRelObj.elements[0]) {
                        const chartId = entry.entryName.replace('_rels/', '').replace('.rels', '');
                        chartRelationships[chartId] = chartRelObj;
                    }
                } catch (error) {
                    console.error(`解析图表关系失败 ${entry.entryName}:`, error);
                }
            }
        });

        console.log(`发现媒体文件 ${Object.keys(mediaFiles).length} 个`);
        console.log(`发现关系映射 ${Object.keys(relationships).length} 个`);
        console.log(`发现图表 ${Object.keys(chartData).length} 个`);

        // 解析文档结构并生成HTML
        const htmlContent = parseDocumentToHtml(
            documentObj,
            stylesObj,
            numberingObj,
            relationships,
            mediaFiles,
            chartData,
            chartRelationships,
            zip
        );

        return {
            html: htmlContent,
            media: mediaFiles
        };
    } catch (error) {
        console.error('转换Word文档失败:', error);
        throw error;
    }
}

/**
 * 解析文档对象并转换为HTML
 */
function parseDocumentToHtml(documentObj, stylesObj, numberingObj, relationships, mediaFiles, chartData, chartRelationships, zip) {
    try {
        // 检查文档结构是否有效
        if (!documentObj || !documentObj.elements || documentObj.elements.length === 0) {
            throw new Error('无效的文档结构');
        }

        // 获取document元素和body元素
        const documentElement = findElementByName(documentObj.elements, 'w:document');
        if (!documentElement || !documentElement.elements) {
            throw new Error('无效的文档结构: 找不到document元素');
        }

        const bodyElement = findElementByName(documentElement.elements, 'w:body');
        if (!bodyElement || !bodyElement.elements) {
            throw new Error('无效的文档结构: 找不到body元素');
        }

        // 解析样式
        const styles = parseStyles(stylesObj);
        // console.log('解析的样式对象:', styles);
        // console.log('样式键列表:', Object.keys(styles));

        // 解析编号（列表）
        const numbering = parseNumbering(numberingObj);

        // 开始构建HTML内容
        let html = '<div class="word-content">';

        // 处理文档内容（段落、表格等）
        if (bodyElement.elements) {
            for (const element of bodyElement.elements) {
                if (element.name === 'w:p') {
                    html += parseParagraph(element, styles, numbering, relationships, mediaFiles, chartData, chartRelationships, zip);
                } else if (element.name === 'w:tbl') {
                    html += parseTable(element, styles, relationships, mediaFiles, chartData, chartRelationships, zip);
                } else if (element.name === 'w:sectPr') {
                    // 处理节属性，如页边距、页面大小等
                    // 这里不做处理，因为HTML不直接对应Word的节概念
                }
            }
        }

        html += '</div>';

        // 处理嵌入的图片
        html = processEmbeddedImages(html, relationships, mediaFiles);

        return html;
    } catch (error) {
        console.error('解析文档结构失败:', error);
        return `<div class="error">解析文档失败: ${error.message}</div>`;
    }
}

/**
 * 在元素数组中查找指定名称的元素
 */
function findElementByName(elements, name) {
    if (!elements || !Array.isArray(elements)) return null;
    return elements.find(element => element.name === name);
}

/**
 * 解析段落并转换为HTML
 */
function parseParagraph(pElement, styles, numbering, relationships, mediaFiles, chartData, chartRelationships, zip) {
    if (!pElement || !pElement.elements) return '';

    // 检查是否为分割线段落 - 边框底部
    const pPrElement = findElementByName(pElement.elements, 'w:pPr');
    const pBdrElement = findElementByName(pPrElement?.elements, 'w:pBdr');
    if (pPrElement && pPrElement.elements) {
        if (pBdrElement && pBdrElement.elements) {
            const bottomElement = findElementByName(pBdrElement.elements, 'w:bottom');
            if (bottomElement && bottomElement.attributes) {
                const val = bottomElement.attributes['w:val'];
                if (val && (val === 'single' || val === 'thick' || val === 'double')) {
                    let style = 'width: 100%; margin: 10px 0;';
                    let borderStyle = 'solid';
                    let borderWidth = '1px';

                    if (val === 'thick') {
                        borderWidth = '3px';
                    } else if (val === 'double') {
                        borderStyle = 'double';
                        borderWidth = '3px';
                    }

                    if (bottomElement.attributes['w:sz']) {
                        // Word中的边框大小单位是1/8点，转换为像素
                        borderWidth = (parseInt(bottomElement.attributes['w:sz']) / 8) + 'px';
                    }

                    let borderColor = '#000000';
                    if (bottomElement.attributes['w:color']) {
                        borderColor = `#${bottomElement.attributes['w:color']}`;
                    }

                    style += `border-bottom: ${borderWidth} ${borderStyle} ${borderColor};height:${borderWidth}`;

                    return `<div style="${style}">&nbsp;</div>`;
                }
            }
        }

        // 处理列表
        const numPrElement = findElementByName(pPrElement.elements, 'w:numPr');
        if (numPrElement) {
            return parseListItem(pElement, numbering, styles, relationships, mediaFiles, chartData, chartRelationships, zip);
        }
    }

    // 检查是否为水平线(形状线)
    const rElements = pElement.elements.filter(e => e.name === 'w:r');
    for (const rElement of rElements) {
        if (!rElement.elements) continue;

        const drawingElement = findElementByName(rElement.elements, 'w:drawing');
        if (!drawingElement || !drawingElement.elements) continue;

        const inlineElement = findElementByName(drawingElement.elements, 'wp:inline');
        if (!inlineElement || !inlineElement.elements) continue;

        const graphicElement = findElementByName(inlineElement.elements, 'a:graphic');
        if (!graphicElement || !graphicElement.elements) continue;

        const graphicDataElement = findElementByName(graphicElement.elements, 'a:graphicData');
        if (!graphicDataElement || !graphicDataElement.elements) continue;

        const wspElement = findElementByName(graphicDataElement.elements, 'wps:wsp');
        if (!wspElement || !wspElement.elements) continue;

        const spPrElement = findElementByName(wspElement.elements, 'wps:spPr');
        if (!spPrElement || !spPrElement.elements) continue;

        const lnElement = findElementByName(spPrElement.elements, 'a:ln');
        if (!lnElement) continue;

        // 尝试获取线条颜色
        let lineColor = '#333333';

        if (lnElement.elements) {
            const solidFillElement = findElementByName(lnElement.elements, 'a:solidFill');
            if (solidFillElement && solidFillElement.elements) {
                const srgbClrElement = findElementByName(solidFillElement.elements, 'a:srgbClr');
                if (srgbClrElement && srgbClrElement.attributes && srgbClrElement.attributes.val) {
                    lineColor = `#${srgbClrElement.attributes.val}`;
                }

                const schemeClrElement = findElementByName(solidFillElement.elements, 'a:schemeClr');
                if (schemeClrElement && schemeClrElement.attributes && schemeClrElement.attributes.val) {
                    const schemeColor = schemeClrElement.attributes.val;
                    // 映射方案颜色到RGB
                    switch (schemeColor) {
                        case 'accent1': lineColor = '#4472C4'; break; // Office蓝色
                        case 'accent2': lineColor = '#ED7D31'; break; // Office橙色
                        case 'accent3': lineColor = '#A5A5A5'; break; // Office灰色
                        case 'accent4': lineColor = '#FFC000'; break; // Office黄色
                        case 'accent5': lineColor = '#5B9BD5'; break; // Office浅蓝色
                        case 'accent6': lineColor = '#70AD47'; break; // Office绿色
                        case 'dk1': lineColor = '#000000'; break;
                        case 'dk2': lineColor = '#44546A'; break;
                        case 'lt1': lineColor = '#FFFFFF'; break;
                        case 'lt2': lineColor = '#E7E6E6'; break;
                    }
                }
            }
        }

        // 尝试获取线条宽度
        let lineWidth = '1px';
        if (lnElement.attributes && lnElement.attributes.w) {
            // 单位是EMU(English Metric Unit)，转换为像素
            lineWidth = `${parseInt(lnElement.attributes.w) / 12700}px`;
        }

        return `<hr style="width: 100%; border: ${lineWidth} solid ${lineColor}; margin: 15px 0;">`;
    }

    // 正常段落处理逻辑
    let html = '<p';
    let pStyle = '';
    let pContent = '';

    // 解析段落属性
    if (pPrElement) {
        // 段落样式
        const pStyleElement = findElementByName(pPrElement.elements, 'w:pStyle');
        if (pStyleElement && pStyleElement.attributes && pStyleElement.attributes['w:val']) {
            const styleId = pStyleElement.attributes['w:val'];
            // console.log('应用段落样式，ID:', styleId, '存在样式对象:', !!styles, '样式内容:', styles[styleId]);
            if (styles && styles[styleId]) {
                pStyle += styles[styleId];
            }

            // 标记段落类型，用于后续处理
            if (styleId.startsWith('Heading')) {
                html = `<h${styleId.charAt(styleId.length - 1)}`;
            }
        }

        // 对齐方式
        const jcElement = findElementByName(pPrElement.elements, 'w:jc');
        if (jcElement && jcElement.attributes && jcElement.attributes['w:val']) {
            const alignment = jcElement.attributes['w:val'];
            switch (alignment) {
                case 'left':
                    pStyle += 'text-align: left;';
                    break;
                case 'right':
                    pStyle += 'text-align: right;';
                    break;
                case 'center':
                    pStyle += 'text-align: center;';
                    break;
                case 'both':
                case 'justify':
                    pStyle += 'text-align: justify;';
                    break;
                case 'distribute':
                    // 分散对齐 - 在CSS中通过text-align-last和text-justify结合实现
                    pStyle += 'text-align: justify; text-align-last: justify; text-justify: distribute;';
                    break;
                default:
                    pStyle += `text-align: ${alignment};`;
            }
        }

        // 缩进
        const indElement = findElementByName(pPrElement.elements, 'w:ind');
        if (indElement && indElement.attributes) {
            if (indElement.attributes['w:left']) {
                pStyle += `margin-left: ${parseFloat(indElement.attributes['w:left']) / 20}px;`;
            }
            if (indElement.attributes['w:right']) {
                pStyle += `margin-right: ${parseFloat(indElement.attributes['w:right']) / 20}px;`;
            }
            if (indElement.attributes['w:firstLine']) {
                pStyle += `text-indent: ${parseFloat(indElement.attributes['w:firstLine']) / 20}px;`;
            }
        }

        // 间距设置
        const spacingElement = findElementByName(pPrElement.elements, 'w:spacing');
        if (spacingElement && spacingElement.attributes) {
            if (spacingElement.attributes['w:before']) {
                pStyle += `margin-top: ${parseFloat(spacingElement.attributes['w:before']) / 20}px;`;
            }
            if (spacingElement.attributes['w:after']) {
                pStyle += `margin-bottom: ${parseFloat(spacingElement.attributes['w:after']) / 20}px;`;
            }
            if (spacingElement.attributes['w:line']) {
                // Word中的行距单位是1/240英寸，转换为像素或相对单位
                const lineHeight = parseFloat(spacingElement.attributes['w:line']) / 240;
                pStyle += `line-height: ${lineHeight.toFixed(2)};`;
            }
        }

        // 边框设置
        if (pBdrElement && pBdrElement.elements) {
            const sides = ['top', 'right', 'bottom', 'left'];
            for (const side of sides) {
                const borderElement = findElementByName(pBdrElement.elements, `w:${side}`);
                if (borderElement && borderElement.attributes) {
                    let borderStyle = 'solid';
                    if (borderElement.attributes['w:val'] === 'double') {
                        borderStyle = 'double';
                    } else if (borderElement.attributes['w:val'] === 'dashed') {
                        borderStyle = 'dashed';
                    } else if (borderElement.attributes['w:val'] === 'dotted') {
                        borderStyle = 'dotted';
                    }

                    let width = '1px';
                    if (borderElement.attributes['w:sz']) {
                        width = `${parseInt(borderElement.attributes['w:sz']) / 8}px`;
                    }

                    let color = '#000000';
                    if (borderElement.attributes['w:color']) {
                        color = `#${borderElement.attributes['w:color']}`;
                        if (borderElement.attributes['w:color'] === 'auto') {
                            color = 'inherit';
                        }
                    }

                    pStyle += `border-${side}: ${width} ${borderStyle} ${color};`;
                }
            }
        }

        // 背景颜色设置
        const shdElement = findElementByName(pPrElement.elements, 'w:shd');
        if (shdElement && shdElement.attributes && shdElement.attributes['w:fill'] &&
            shdElement.attributes['w:fill'] !== 'auto') {
            pStyle += `background-color: #${shdElement.attributes['w:fill']};`;
        }
    }

    if (pStyle) {
        html += ` style="${pStyle}">`;
    }

    // 解析段落内容（运行）
    const runs = pElement.elements.filter(e => e.name === 'w:r');
    for (const run of runs) {
        pContent += parseRun(run, false, relationships, mediaFiles, chartData, chartRelationships, zip);
    }

    // 处理字段代码
    const fldSimpleElements = pElement.elements.filter(e => e.name === 'w:fldSimple');
    for (const fldSimple of fldSimpleElements) {
        // 获取字段指令
        let fieldInstr = '';
        if (fldSimple.attributes && fldSimple.attributes['w:instr']) {
            fieldInstr = fldSimple.attributes['w:instr'];
        }

        // 获取字段内容（如果有）
        let fieldContent = '';
        if (fldSimple.elements) {
            const fieldRuns = fldSimple.elements.filter(e => e.name === 'w:r');
            for (const r of fieldRuns) {
                fieldContent += parseRun(r, false, relationships, mediaFiles, chartData, chartRelationships, zip);
            }
        }

        // 根据字段类型进行处理
        if (fieldInstr.includes('FORMTEXT')) {
            // 表单文本字段
            pContent += `<span class="form-field form-text">${fieldContent || '［表单字段］'}</span>`;
        } else if (fieldInstr.includes('FORMCHECKBOX')) {
            // 复选框字段
            pContent += `<span class="form-field form-checkbox">☐ ${fieldContent}</span>`;
        } else if (fieldInstr.includes('FORMDROPDOWN')) {
            // 下拉字段
            pContent += `<span class="form-field form-dropdown">［下拉字段］</span>`;
        } else if (fieldInstr.includes('DATE')) {
            // 日期字段
            pContent += `<span class="field field-date">${fieldContent || '［日期字段］'}</span>`;
        } else if (fieldInstr.includes('PAGE')) {
            // 页码字段
            pContent += `<span class="field field-page">${fieldContent || '1'}</span>`;
        } else {
            // 其他字段类型
            pContent += `<span class="field">${fieldContent || '［字段］'}</span>`;
        }
    }

    // 处理复杂字段
    let inField = false;
    let fieldContent = '';
    for (const run of runs) {
        if (!run.elements) continue;

        const fldCharElement = findElementByName(run.elements, 'w:fldChar');
        if (fldCharElement && fldCharElement.attributes && fldCharElement.attributes['w:fldCharType']) {
            if (fldCharElement.attributes['w:fldCharType'] === 'begin') {
                inField = true;
                fieldContent = '';
            } else if (fldCharElement.attributes['w:fldCharType'] === 'end') {
                inField = false;
                if (fieldContent) {
                    pContent += `<span class="complex-field">${fieldContent}</span>`;
                }
            }
        } else if (inField) {
            const instrTextElement = findElementByName(run.elements, 'w:instrText');
            if (instrTextElement) {
                // 这是字段指令文本
                // 处理指令
            } else {
                // 这是字段内容
                fieldContent += parseRun(run, false, relationships, mediaFiles, chartData, chartRelationships, zip);
            }
        }
    }

    // 处理超链接
    const hyperlinkElements = pElement.elements.filter(e => e.name === 'w:hyperlink');
    for (const hyperlink of hyperlinkElements) {
        let href = '#';
        if (hyperlink.attributes && hyperlink.attributes['r:id']) {
            // 从关系中获取实际的URL
            const relationId = hyperlink.attributes['r:id'];
            if (relationships && relationships[relationId]) {
                href = relationships[relationId].target;
            } else {
                href = relationId; // 如果找不到关系，使用ID作为href
            }
        }

        let linkText = '';
        if (hyperlink.elements) {
            const linkRuns = hyperlink.elements.filter(e => e.name === 'w:r');
            for (const run of linkRuns) {
                linkText += parseRun(run, true, relationships, mediaFiles, chartData, chartRelationships, zip);
            }
        }

        pContent += `<a href="${href}">${linkText || href}</a>`;
    }

    // 如果段落内容为空，添加一个空格确保段落高度
    if (!pContent.trim()) {
        pContent = '&nbsp;';
    }

    html += pContent + '</' + html.substring(1, html.indexOf(' ') > 0 ? html.indexOf(' ') : html.length) + '>';
    if (!html.endsWith(">")) {
        html += '>';
    }

    return html;
}

/**
 * 解析文本运行并转换为HTML
 */
function parseRun(rElement, isHyperlink, relationships, mediaFiles, chartData, chartRelationships, zip) {
    if (!rElement || !rElement.elements) {
        return '';
    }

    let html = '';
    let content = '';
    let style = '';

    // 解析运行属性
    const rPrElement = findElementByName(rElement.elements, 'w:rPr');
    if (rPrElement && rPrElement.elements) {
        // 字体
        const fontElement = findElementByName(rPrElement.elements, 'w:rFonts');
        if (fontElement && fontElement.attributes) {
            let fontFamily = '';

            if (fontElement.attributes['w:cs']) {
                fontFamily = `${fontElement.attributes['w:cs']}`;
            }
            else if (fontElement.attributes['w:eastAsia']) {
                fontFamily = `${fontElement.attributes['w:eastAsia']}`;
            }
            else if (fontElement.attributes['w:ascii']) {
                fontFamily = `${fontElement.attributes['w:ascii']}`;
            }
            else if (fontElement.attributes['w:hAnsi']) {
                fontFamily = `${fontElement.attributes['w:hAnsi']}`;
            }

            if (fontFamily) {
                // 添加常见字体替代，提高兼容性
                let fallbackFonts = "Arial, 'Segoe UI', Tahoma, sans-serif";

                // 映射常见中文字体到Web安全字体
                if (fontFamily === '宋体' || fontFamily.toLowerCase() === 'simsun') {
                    fontFamily = 'SimSun, SimSun-local';
                    fallbackFonts = "NSimSun, 'MS Song', serif";
                } else if (fontFamily === '黑体' || fontFamily.toLowerCase() === 'simhei') {
                    fontFamily = 'SimHei, SimHei-local';
                    fallbackFonts = "'Microsoft YaHei', 'MS Hei', sans-serif";
                } else if (fontFamily === '微软雅黑' || fontFamily.toLowerCase() === 'microsoft yahei' || fontFamily.toLowerCase().includes('microsoft ya')) {
                    fontFamily = "'Microsoft YaHei', 'Microsoft YaHei-local'";
                    fallbackFonts = "'MS YaHei', 'PingFang SC', sans-serif";
                } else if (fontFamily === '楷体' || fontFamily.toLowerCase() === 'kaiti' || fontFamily === '楷体_GB2312') {
                    fontFamily = 'KaiTi, KaiTi-local';
                    fallbackFonts = "'MS Kaiti', STKaiti, serif";
                } else if (fontFamily === '仿宋' || fontFamily.toLowerCase() === 'fangsong' || fontFamily === '仿宋_GB2312') {
                    fontFamily = 'FangSong, FangSong-local';
                    fallbackFonts = "'MS FangSong', STFangsong, serif";
                } else if (fontFamily.toLowerCase() === 'arial') {
                    fontFamily = 'Arial';
                    fallbackFonts = "Helvetica, 'Helvetica Neue', sans-serif";
                } else if (fontFamily.toLowerCase() === 'times new roman' || fontFamily.toLowerCase().includes('times new')) {
                    fontFamily = "'Times New Roman'";
                    fallbackFonts = "Times, Georgia, serif";
                } else if (fontFamily.toLowerCase() === 'calibri' || fontFamily.toLowerCase().includes('calib')) {
                    fontFamily = 'Calibri';
                    fallbackFonts = "'Segoe UI', Candara, Arial, sans-serif";
                } else if (fontFamily.toLowerCase() === 'cambria' || fontFamily.toLowerCase().includes('camb')) {
                    fontFamily = 'Cambria';
                    fallbackFonts = "'Times New Roman', Georgia, serif";
                } else if (fontFamily.toLowerCase() === 'century gothic' || fontFamily.toLowerCase().includes('century')) {
                    fontFamily = "'Century Gothic'";
                    fallbackFonts = "'Apple Gothic', AppleGothic, Futura, sans-serif";
                } else if (fontFamily.toLowerCase() === 'courier new' || fontFamily.toLowerCase().includes('courier')) {
                    fontFamily = "'Courier New'";
                    fallbackFonts = "Courier, monospace";
                } else if (fontFamily.toLowerCase() === 'consolas' || fontFamily.toLowerCase().includes('consol')) {
                    fontFamily = 'Consolas';
                    fallbackFonts = "Monaco, 'Lucida Console', monospace";
                } else if (fontFamily.toLowerCase() === 'verdana' || fontFamily.toLowerCase().includes('verdan')) {
                    fontFamily = 'Verdana';
                    fallbackFonts = "Geneva, Tahoma, sans-serif";
                } else if (fontFamily.toLowerCase() === 'segoe ui' || fontFamily.toLowerCase().includes('segoe')) {
                    fontFamily = "'Segoe UI'";
                    fallbackFonts = "Tahoma, Helvetica, Arial, sans-serif";
                } else if (fontFamily.toLowerCase() === 'tahoma' || fontFamily.toLowerCase().includes('taho')) {
                    fontFamily = 'Tahoma';
                    fallbackFonts = "Geneva, Verdana, sans-serif";
                } else if (fontFamily.toLowerCase() === 'georgia' || fontFamily.toLowerCase().includes('georg')) {
                    fontFamily = 'Georgia';
                    fallbackFonts = "'Times New Roman', Times, serif";
                } else if (fontFamily.toLowerCase() === 'helvetica' || fontFamily.toLowerCase().includes('helve')) {
                    fontFamily = 'Helvetica';
                    fallbackFonts = "Arial, 'Helvetica Neue', sans-serif";
                } else {
                    // 其他未明确匹配的字体，包装为引号格式防止CSS解析错误
                    fontFamily = `'${fontFamily}'`;
                }

                style += `font-family: ${fontFamily}, ${fallbackFonts};`;
            }

        }

        // 粗体
        if (findElementByName(rPrElement.elements, 'w:b')) {
            style += 'font-weight: bold;';
        }

        // 斜体
        if (findElementByName(rPrElement.elements, 'w:i')) {
            style += 'font-style: italic;';
        }

        // 下划线
        const uElement = findElementByName(rPrElement.elements, 'w:u');
        if (uElement && uElement.attributes && uElement.attributes['w:val']) {
            const underlineType = uElement.attributes['w:val'];

            if (underlineType === 'single') {
                style += 'text-decoration: underline;';
            } else if (underlineType === 'double') {
                style += 'text-decoration: underline; text-decoration-style: double;';
            } else if (underlineType === 'dotted') {
                style += 'text-decoration: underline; text-decoration-style: dotted;';
            } else if (underlineType === 'dash' || underlineType === 'dashed') {
                style += 'text-decoration: underline; text-decoration-style: dashed;';
            } else if (underlineType === 'wave') {
                style += 'text-decoration: underline wavy;';
            } else if (underlineType === 'none') {
                style += 'text-decoration: none;';
            }

            // 处理下划线颜色
            if (uElement.attributes['w:color']) {
                style += `text-decoration-color: #${uElement.attributes['w:color']};`;
            }
        }

        // 删除线
        if (findElementByName(rPrElement.elements, 'w:strike') || findElementByName(rPrElement.elements, 'w:dstrike')) {
            style += 'text-decoration: line-through;';
        }

        // 字体大小
        const szElement = findElementByName(rPrElement.elements, 'w:sz');
        if (szElement && szElement.attributes && szElement.attributes['w:val']) {
            // Word中的字号单位是半点，需要转换为pt
            const fontSize = parseInt(szElement.attributes['w:val']) / 2;
            style += `font-size: ${fontSize}pt;`;
        }

        // 字符间距
        const spacingElement = findElementByName(rPrElement.elements, 'w:spacing');
        if (spacingElement && spacingElement.attributes && spacingElement.attributes['w:val']) {
            // Word中的字符间距单位是缇，需要转换为像素或其他单位
            const spacing = parseInt(spacingElement.attributes['w:val']) / 20;
            style += `letter-spacing: ${spacing}px;`;
        }

        // 文本高亮
        const highlightElement = findElementByName(rPrElement.elements, 'w:highlight');
        if (highlightElement && highlightElement.attributes && highlightElement.attributes['w:val']) {
            const highlightColor = highlightElement.attributes['w:val'];
            // 转换Word高亮颜色为CSS
            const colorMap = {
                'yellow': '#FFFF00',
                'green': '#00FF00',
                'cyan': '#00FFFF',
                'magenta': '#FF00FF',
                'blue': '#0000FF',
                'red': '#FF0000',
                'darkBlue': '#000080',
                'darkCyan': '#008080',
                'darkGreen': '#008000',
                'darkMagenta': '#800080',
                'darkRed': '#800000',
                'darkYellow': '#808000',
                'darkGray': '#808080',
                'lightGray': '#C0C0C0',
                'black': '#000000'
            };

            const bgColor = colorMap[highlightColor] || highlightColor;
            style += `background-color: ${bgColor};`;
        }

        // 文本颜色
        const colorElement = findElementByName(rPrElement.elements, 'w:color');
        if (colorElement && colorElement.attributes && colorElement.attributes['w:val'] && colorElement.attributes['w:val'] !== 'auto') {
            style += `color: #${colorElement.attributes['w:val']};`;
        }

        // 上标/下标
        const vertAlignElement = findElementByName(rPrElement.elements, 'w:vertAlign');
        if (vertAlignElement && vertAlignElement.attributes && vertAlignElement.attributes['w:val']) {
            const vertAlign = vertAlignElement.attributes['w:val'];
            if (vertAlign === 'superscript') {
                style += 'vertical-align: super; font-size: smaller;';
            } else if (vertAlign === 'subscript') {
                style += 'vertical-align: sub; font-size: smaller;';
            }
        }

        // 字符缩放
        const wElement = findElementByName(rPrElement.elements, 'w:w');
        if (wElement && wElement.attributes && wElement.attributes['w:val']) {
            // Word中的缩放值是百分比
            const scaling = parseInt(wElement.attributes['w:val']) / 100;
            style += `transform: scaleX(${scaling});`;
        }

        // 大写小写转换
        const capsElement = findElementByName(rPrElement.elements, 'w:caps');
        if (capsElement) {
            style += 'text-transform: uppercase;';
        }

        const smallCapsElement = findElementByName(rPrElement.elements, 'w:smallCaps');
        if (smallCapsElement) {
            style += 'font-variant: small-caps;';
        }

        // 隐藏文本
        const vanishElement = findElementByName(rPrElement.elements, 'w:vanish');
        if (vanishElement) {
            style += 'display: none;';
        }
    }

    // 处理文本内容
    const textElements = rElement.elements.filter(e => e.name === 'w:t');
    for (const textElement of textElements) {
        let text = '';

        // 获取文本内容
        if (textElement.elements && textElement.elements.length > 0) {
            // 处理文本节点
            for (const node of textElement.elements) {
                if (node.type === 'text') {
                    text += node.text;
                }
            }
        } else if (textElement.attributes && textElement.attributes.space === 'preserve') {
            // 空文本，但需要保留空格
            text = ' ';
        }

        // 处理保留空格的属性
        if (textElement.attributes && textElement.attributes.space === 'preserve') {
            // 确保空格被保留
            text = text.replace(/ /g, '&nbsp;');
        }

        content += text;
    }

    // 处理制表符
    if (findElementByName(rElement.elements, 'w:tab')) {
        content += '&nbsp;&nbsp;&nbsp;&nbsp;'; // 使用4个空格代替制表符
    }

    // 处理回车换行
    if (findElementByName(rElement.elements, 'w:br')) {
        content += '<br>';
    }

    // 处理非换行空格
    if (findElementByName(rElement.elements, 'w:noBreakHyphen')) {
        content += '&#8209;'; // 非断行连字符的Unicode字符
    }

    // 处理软换行
    if (findElementByName(rElement.elements, 'w:softHyphen')) {
        content += '&shy;'; // 软连字符
    }

    // 处理分页符
    if (findElementByName(rElement.elements, 'w:lastRenderedPageBreak')) {
        html += '<div class="page-break"></div>';
    }

    // 处理绘图元素（图片、图表等）
    const drawingElement = findElementByName(rElement.elements, 'w:drawing');
    if (drawingElement && drawingElement.elements) {
        return parseDrawing(drawingElement, relationships, mediaFiles, chartData, chartRelationships, zip);
    }

    // 处理图片
    const pictureElement = findElementByName(rElement.elements, 'w:pict');
    if (pictureElement && pictureElement.elements) {
        return parsePicture(pictureElement, relationships, mediaFiles);
    }

    // 处理特殊符号
    const symbolElement = findElementByName(rElement.elements, 'w:sym');
    if (symbolElement && symbolElement.attributes && symbolElement.attributes['w:char']) {
        const symbolChar = symbolElement.attributes['w:char'];
        const fontFamily = symbolElement.attributes['w:font'] || 'Symbol';

        // 转换16进制字符到实际符号
        const charCode = parseInt(symbolChar, 16);
        content = String.fromCharCode(charCode);
        style += `font-family: '${fontFamily}';`;
    }

    // 如果是超链接内容，不添加额外的span标签
    if (isHyperlink) {
        if (style) {
            return `<span style="${style}">${content}</span>`;
        }
        return content;
    }

    // 将文本包装在span中，添加样式
    if (content) {
        if (style) {
            html += `<span style="${style}">${content}</span>`;
        } else {
            html += content;
        }
    }

    return html;
}

/**
 * 解析图片绘制指令
 */
function parseDrawing(drawingElement, relationships, mediaFiles, chartData, chartRelationships, zip) {
    try {
        if (!drawingElement || !drawingElement.elements) return '';

        // 尝试获取图片信息
        let imageId = '';
        let width = 0;
        let height = 0;
        let description = '';
        let isChart = false;
        let chartId = '';

        // 查找内联图片或锚点图片
        const inlineElement = findElementByName(drawingElement.elements, 'wp:inline');
        const anchorElement = findElementByName(drawingElement.elements, 'wp:anchor');

        // 处理内联图片
        if (inlineElement && inlineElement.elements) {
            // 提取尺寸
            const extentElement = findElementByName(inlineElement.elements, 'wp:extent');
            if (extentElement && extentElement.attributes) {
                if (extentElement.attributes.cx) {
                    width = parseInt(extentElement.attributes.cx) / 9525; // EMU到像素的近似转换
                }
                if (extentElement.attributes.cy) {
                    height = parseInt(extentElement.attributes.cy) / 9525; // EMU到像素的近似转换
                }
            }

            // 获取描述
            const docPrElement = findElementByName(inlineElement.elements, 'wp:docPr');
            if (docPrElement && docPrElement.attributes) {
                description = docPrElement.attributes.descr || docPrElement.attributes.name || '';
            }

            // 检查是否为图表
            const graphicElement = findElementByName(inlineElement.elements, 'a:graphic');
            if (graphicElement && graphicElement.elements) {
                const graphicDataElement = findElementByName(graphicElement.elements, 'a:graphicData');
                if (graphicDataElement && graphicDataElement.attributes &&
                    graphicDataElement.attributes.uri &&
                    graphicDataElement.attributes.uri.includes('chart')) {

                    isChart = true;
                    // 尝试获取图表ID
                    const chartElement = findElementByName(graphicDataElement.elements, 'c:chart');
                    if (chartElement && chartElement.attributes && chartElement.attributes['r:id']) {
                        chartId = chartElement.attributes['r:id'];
                    }
                } else if (graphicDataElement && graphicDataElement.elements) {
                    // 如果不是图表，尝试获取图片ID
                    const picElement = findElementByName(graphicDataElement.elements, 'pic:pic');
                    if (picElement && picElement.elements) {
                        const blipFillElement = findElementByName(picElement.elements, 'pic:blipFill');
                        if (blipFillElement && blipFillElement.elements) {
                            const blipElement = findElementByName(blipFillElement.elements, 'a:blip');
                            if (blipElement && blipElement.attributes && blipElement.attributes['r:embed']) {
                                imageId = blipElement.attributes['r:embed'];
                            }
                        }
                    }
                }
            }
        }
        // 处理锚点图片（浮动图片）
        else if (anchorElement && anchorElement.elements) {
            // 提取尺寸
            const extentElement = findElementByName(anchorElement.elements, 'wp:extent');
            if (extentElement && extentElement.attributes) {
                if (extentElement.attributes.cx) {
                    width = parseInt(extentElement.attributes.cx) / 9525;
                }
                if (extentElement.attributes.cy) {
                    height = parseInt(extentElement.attributes.cy) / 9525;
                }
            }

            // 获取描述
            const docPrElement = findElementByName(anchorElement.elements, 'wp:docPr');
            if (docPrElement && docPrElement.attributes) {
                description = docPrElement.attributes.descr || docPrElement.attributes.name || '';
            }

            // 检查是否为图表
            const graphicElement = findElementByName(anchorElement.elements, 'a:graphic');
            if (graphicElement && graphicElement.elements) {
                const graphicDataElement = findElementByName(graphicElement.elements, 'a:graphicData');
                if (graphicDataElement && graphicDataElement.attributes &&
                    graphicDataElement.attributes.uri &&
                    graphicDataElement.attributes.uri.includes('chart')) {

                    isChart = true;
                    // 尝试获取图表ID
                    const chartElement = findElementByName(graphicDataElement.elements, 'c:chart');
                    if (chartElement && chartElement.attributes && chartElement.attributes['r:id']) {
                        chartId = chartElement.attributes['r:id'];
                    }
                } else if (graphicDataElement && graphicDataElement.elements) {
                    // 如果不是图表，尝试获取图片ID
                    const picElement = findElementByName(graphicDataElement.elements, 'pic:pic');
                    if (picElement && picElement.elements) {
                        const blipFillElement = findElementByName(picElement.elements, 'pic:blipFill');
                        if (blipFillElement && blipFillElement.elements) {
                            const blipElement = findElementByName(blipFillElement.elements, 'a:blip');
                            if (blipElement && blipElement.attributes && blipElement.attributes['r:embed']) {
                                imageId = blipElement.attributes['r:embed'];
                            }
                        }
                    }
                }
            }
        }

        // 处理图表
        if (isChart && chartId && relationships) {
            // 从关系中获取图表路径
            const chartRel = relationships[chartId];
            if (chartRel && chartRel.target) {
                return parseChart(chartId, chartData, chartRelationships, mediaFiles, zip);
            }

            // 如果找不到图表路径，返回占位符
            return `<div class="chart-error">找不到图表数据 (ID: ${chartId})</div>`;
        }

        // 构建图片HTML
        if (imageId && relationships) {
            let style = '';
            if (width && height) {
                style = `width: ${width}px; height: ${height}px;`;
            }

            // 使用data-docx-image-id标记图片，稍后会处理成Base64
            return `<img data-docx-image-id="${imageId}" alt="${description}" style="${style}" />`;
        }
    } catch (error) {
        console.error('解析图片失败:', error);
    }

    return '[图片解析失败]';
}

/**
 * 解析表格并转换为HTML
 */
function parseTable(tblElement, styles, relationships, mediaFiles, chartData, chartRelationships, zip) {
    if (!tblElement || !tblElement.elements) {
        return '';
    }

    let html = '';
    let isFloatingTable = false;
    let tableStyle = '';

    // 表格属性
    const tblPrElement = findElementByName(tblElement.elements, 'w:tblPr');
    if (tblPrElement && tblPrElement.elements) {
        // 检查表格样式
        const tblStyleElement = findElementByName(tblPrElement.elements, 'w:tblStyle');
        if (tblStyleElement && tblStyleElement.attributes && tblStyleElement.attributes['w:val']) {
            const styleId = tblStyleElement.attributes['w:val'];
            // console.log('应用表格样式，ID:', styleId, '存在样式对象:', !!styles, '样式内容:', styles[styleId]);
            if (styles && styles[styleId]) {
                tableStyle += styles[styleId];
            }
        }

        // 检查是否为浮动表格
        const tblpPrElement = findElementByName(tblPrElement.elements, 'w:tblpPr');
        if (tblpPrElement && tblpPrElement.attributes) {
            isFloatingTable = true;

            // 绝对定位属性
            if (tblpPrElement.attributes['w:tblpX']) {
                const xPos = parseInt(tblpPrElement.attributes['w:tblpX']) / 20;
                tableStyle += `margin-left: ${xPos}px; `;
            }

            if (tblpPrElement.attributes['w:tblpY']) {
                const yPos = parseInt(tblpPrElement.attributes['w:tblpY']) / 20;
                tableStyle += `margin-top: ${yPos}px; `;
            }

            // 相对定位属性
            if (tblpPrElement.attributes['w:horzAnchor']) {
                const horzAnchor = tblpPrElement.attributes['w:horzAnchor'];
                if (horzAnchor === 'margin') {
                    tableStyle += 'position: relative; ';
                } else if (horzAnchor === 'page') {
                    tableStyle += 'position: absolute; ';
                }
            }

            // z-index
            if (tblpPrElement.attributes['w:z']) {
                const zIndex = parseInt(tblpPrElement.attributes['w:z']);
                tableStyle += `z-index: ${zIndex}; `;
            }
        }

        // 表格宽度
        const tblWElement = findElementByName(tblPrElement.elements, 'w:tblW');
        if (tblWElement && tblWElement.attributes) {
            const width = tblWElement.attributes['w:w'];
            const type = tblWElement.attributes['w:type'];

            if (width && type === 'dxa') {
                // dxa单位，转换为像素
                tableStyle += `width: ${parseInt(width) / 20}px; `;
            } else if (width && type === 'pct') {
                // 百分比
                tableStyle += `width: ${parseInt(width) / 50}%; `;
            } else if (width && type === 'auto') {
                tableStyle += 'width: auto; ';
            }
        }

        // 表格边框
        const tblBordersElement = findElementByName(tblPrElement.elements, 'w:tblBorders');
        if (tblBordersElement && tblBordersElement.elements) {
            const borderElements = ['w:top', 'w:left', 'w:bottom', 'w:right', 'w:insideH', 'w:insideV'];
            let borderStyle = '';

            for (const borderName of borderElements) {
                const borderElement = findElementByName(tblBordersElement.elements, borderName);
                if (borderElement && borderElement.attributes) {
                    const side = borderName.split(':')[1];
                    const val = borderElement.attributes['w:val'];
                    const size = borderElement.attributes['w:sz'];
                    const color = borderElement.attributes['w:color'];

                    if (val && val !== 'nil') {
                        let width = '1px';
                        if (size) {
                            width = `${parseInt(size) / 8}px`;
                        }

                        let colorValue = '#000000';
                        if (color && color !== 'auto') {
                            colorValue = `#${color}`;
                        }

                        let style = 'solid';
                        if (val === 'dashed') {
                            style = 'dashed';
                        } else if (val === 'dotted') {
                            style = 'dotted';
                        } else if (val === 'double') {
                            style = 'double';
                        }

                        if (side === 'top') {
                            borderStyle += `border-top: ${width} ${style} ${colorValue}; `;
                        } else if (side === 'left') {
                            borderStyle += `border-left: ${width} ${style} ${colorValue}; `;
                        } else if (side === 'bottom') {
                            borderStyle += `border-bottom: ${width} ${style} ${colorValue}; `;
                        } else if (side === 'right') {
                            borderStyle += `border-right: ${width} ${style} ${colorValue}; `;
                        } else if (side === 'insideH') {
                            // 内部水平边框 - 会应用到单元格
                        } else if (side === 'insideV') {
                            // 内部垂直边框 - 会应用到单元格
                        }
                    }
                }
            }

            if (borderStyle) {
                tableStyle += borderStyle;
            } else {
                tableStyle += 'border-collapse: collapse; border: 1px solid #ccc; ';
            }
        }

        // 表格对齐
        const tblJClement = findElementByName(tblPrElement.elements, 'w:jc');
        if (tblJClement && tblJClement.attributes) {
            const alignment = tblJClement.attributes['w:val'];
            if (alignment === 'center') {
                tableStyle += 'margin-left: auto; margin-right: auto;';
            } else if (alignment === 'right') {
                tableStyle += 'margin-left: auto; margin-right: 0;';
            } else if (alignment === 'left') {
                tableStyle += 'margin-left: 0; margin-right: auto;';
            }
        }
    }

    // 包裹浮动表格
    let tableWrapperStart = '';
    let tableWrapperEnd = '';

    if (isFloatingTable) {
        tableWrapperStart = '<div class="table-container">';
        tableWrapperEnd = '</div>';
        html += tableWrapperStart;
    }

    // 开始表格
    html += '<table';

    if (isFloatingTable) {
        html += ' class="floating-table"';
    }

    if (tableStyle) {
        html += ` style="${tableStyle}"`;
    }

    html += '>';

    // 处理表格网格（列宽）
    const tblGridElement = findElementByName(tblElement.elements, 'w:tblGrid');
    const colWidths = [];

    if (tblGridElement && tblGridElement.elements) {
        const gridColElements = tblGridElement.elements.filter(e => e.name === 'w:gridCol');
        for (const gridCol of gridColElements) {
            if (gridCol.attributes && gridCol.attributes['w:w']) {
                // 将Word单位转换为像素
                const width = parseInt(gridCol.attributes['w:w']) / 20;
                colWidths.push(width);
            }
        }
    }

    // 处理表格行
    const trElements = tblElement.elements.filter(e => e.name === 'w:tr');
    for (const trElement of trElements) {
        if (!trElement.elements) continue;

        let rowHtml = '<tr';
        let rowStyle = '';

        // 行属性
        const trPrElement = findElementByName(trElement.elements, 'w:trPr');
        if (trPrElement && trPrElement.elements) {
            // 行高
            const trHeightElement = findElementByName(trPrElement.elements, 'w:trHeight');
            if (trHeightElement && trHeightElement.attributes) {
                const height = trHeightElement.attributes['w:val'];
                const rule = trHeightElement.attributes['w:hRule']; // at-least, exact, auto

                if (height) {
                    const heightPx = parseInt(height) / 20;
                    if (rule === 'exact') {
                        rowStyle += `height: ${heightPx}px; `;
                    } else {
                        rowStyle += `min-height: ${heightPx}px; `;
                    }
                }
            }
        }

        if (rowStyle) {
            rowHtml += ` style="${rowStyle}"`;
        }

        rowHtml += '>';

        // 处理单元格
        const tdElements = trElement.elements.filter(e => e.name === 'w:tc');
        let colIndex = 0;

        for (const tdElement of tdElements) {
            if (!tdElement.elements) continue;

            let cellHtml = '<td';
            let cellStyle = '';

            // 单元格属性
            const tcPrElement = findElementByName(tdElement.elements, 'w:tcPr');
            if (tcPrElement && tcPrElement.elements) {
                // 跨列
                const gridSpanElement = findElementByName(tcPrElement.elements, 'w:gridSpan');
                if (gridSpanElement && gridSpanElement.attributes && gridSpanElement.attributes['w:val']) {
                    const colspan = parseInt(gridSpanElement.attributes['w:val']);
                    if (colspan > 1) {
                        cellHtml += ` colspan="${colspan}"`;
                    }
                    // 调整列索引
                    colIndex += colspan;
                } else {
                    colIndex++;
                }

                // 跨行
                const vMergeElement = findElementByName(tcPrElement.elements, 'w:vMerge');
                if (vMergeElement) {
                    const val = vMergeElement.attributes && vMergeElement.attributes['w:val'];
                    if (val === 'restart') {
                        // 获取跨行数量（需要处理后续行）
                        // 为简化，这里不实现完整的跨行逻辑
                        cellHtml += ` rowspan="2"`;
                    } else {
                        // 这是被合并的单元格，不渲染
                        continue;
                    }
                }

                // 单元格宽度
                const tcWElement = findElementByName(tcPrElement.elements, 'w:tcW');
                if (tcWElement && tcWElement.attributes && tcWElement.attributes['w:w']) {
                    const width = parseInt(tcWElement.attributes['w:w']) / 20;
                    cellStyle += `width: ${width}px; `;
                } else if (colWidths[colIndex - 1]) {
                    // 使用表格定义的列宽
                    cellStyle += `width: ${colWidths[colIndex - 1]}px; `;
                }

                // 垂直对齐
                const vAlignElement = findElementByName(tcPrElement.elements, 'w:vAlign');
                if (vAlignElement && vAlignElement.attributes && vAlignElement.attributes['w:val']) {
                    const vAlign = vAlignElement.attributes['w:val'];
                    switch (vAlign) {
                        case 'top':
                            cellStyle += 'vertical-align: top; ';
                            break;
                        case 'center':
                            cellStyle += 'vertical-align: middle; ';
                            break;
                        case 'bottom':
                            cellStyle += 'vertical-align: bottom; ';
                            break;
                    }
                }

                // 背景色
                const shdElement = findElementByName(tcPrElement.elements, 'w:shd');
                if (shdElement && shdElement.attributes) {
                    if (shdElement.attributes['w:fill'] && shdElement.attributes['w:fill'] !== 'auto') {
                        cellStyle += `background-color: #${shdElement.attributes['w:fill']}; `;
                    }
                }

                // 边框
                const tcBordersElement = findElementByName(tcPrElement.elements, 'w:tcBorders');
                if (tcBordersElement && tcBordersElement.elements) {
                    const sides = [
                        { name: 'w:top', css: 'border-top' },
                        { name: 'w:left', css: 'border-left' },
                        { name: 'w:bottom', css: 'border-bottom' },
                        { name: 'w:right', css: 'border-right' }
                    ];

                    for (const side of sides) {
                        const borderElement = findElementByName(tcBordersElement.elements, side.name);
                        if (borderElement && borderElement.attributes) {
                            const val = borderElement.attributes['w:val'];
                            if (val && val !== 'nil') {
                                let width = '1px';
                                if (borderElement.attributes['w:sz']) {
                                    width = `${parseInt(borderElement.attributes['w:sz']) / 8}px`;
                                }

                                let color = '#000000';
                                if (borderElement.attributes['w:color'] && borderElement.attributes['w:color'] !== 'auto') {
                                    color = `#${borderElement.attributes['w:color']}`;
                                }

                                let style = 'solid';
                                if (val === 'dashed') style = 'dashed';
                                else if (val === 'dotted') style = 'dotted';
                                else if (val === 'double') style = 'double';

                                cellStyle += `${side.css}: ${width} ${style} ${color}; `;
                            }
                        }
                    }
                }

                // 文本方向
                const textDirectionElement = findElementByName(tcPrElement.elements, 'w:textDirection');
                if (textDirectionElement && textDirectionElement.attributes) {
                    const direction = textDirectionElement.attributes['w:val'];
                    if (direction === 'tbRl') {
                        // 从上到下，从右到左
                        cellStyle += 'writing-mode: vertical-rl; transform: rotate(180deg); ';
                    } else if (direction === 'btLr') {
                        // 从下到上，从左到右
                        cellStyle += 'writing-mode: vertical-lr; ';
                    }
                }

                // 单元格边距
                const tcMarElement = findElementByName(tcPrElement.elements, 'w:tcMar');
                if (tcMarElement && tcMarElement.elements) {
                    const margins = [
                        { name: 'w:top', css: 'padding-top' },
                        { name: 'w:left', css: 'padding-left' },
                        { name: 'w:bottom', css: 'padding-bottom' },
                        { name: 'w:right', css: 'padding-right' }
                    ];

                    for (const margin of margins) {
                        const marginElement = findElementByName(tcMarElement.elements, margin.name);
                        if (marginElement && marginElement.attributes && marginElement.attributes['w:w']) {
                            const width = parseInt(marginElement.attributes['w:w']) / 20;
                            cellStyle += `${margin.css}: ${width}px; `;
                        }
                    }
                }
            }

            if (cellStyle) {
                cellHtml += ` style="${cellStyle}"`;
            }

            cellHtml += '>';

            // 处理单元格内容
            let cellContent = '';
            for (const childElement of tdElement.elements) {
                if (childElement.name === 'w:p') {
                    cellContent += parseParagraph(childElement, styles, {}, relationships, mediaFiles, chartData, chartRelationships, zip);
                }
            }

            cellHtml += cellContent + '</td>';
            rowHtml += cellHtml;
        }

        rowHtml += '</tr>';
        html += rowHtml;
    }

    html += '</table>';

    if (isFloatingTable) {
        html += tableWrapperEnd;
    }

    return html;
}

/**
 * 解析列表项并转换为HTML
 */
function parseListItem(pElement, numbering, styles, relationships, mediaFiles, chartData, chartRelationships, zip) {
    if (!pElement || !pElement.elements) {
        return '';
    }

    let listContent = '';

    // 检查是否为列表项
    const pPrElement = findElementByName(pElement.elements, 'w:pPr');
    if (!pPrElement || !pPrElement.elements) {
        return '';
    }

    const numPrElement = findElementByName(pPrElement.elements, 'w:numPr');
    if (!numPrElement || !numPrElement.elements) {
        return '';
    }

    // 获取列表ID和级别
    let numId = '';
    let level = 0;

    const numIdElement = findElementByName(numPrElement.elements, 'w:numId');
    if (numIdElement && numIdElement.attributes && numIdElement.attributes['w:val']) {
        numId = numIdElement.attributes['w:val'];
    }

    const ilvlElement = findElementByName(numPrElement.elements, 'w:ilvl');
    if (ilvlElement && ilvlElement.attributes && ilvlElement.attributes['w:val']) {
        level = parseInt(ilvlElement.attributes['w:val']);
    }

    // 获取列表样式信息
    let listType = 'bullet'; // 默认为项目符号列表
    let listSymbol = '•';
    let listStyleClass = '';

    // 从numbering数据中获取列表样式
    if (numbering && numbering[numId] && numbering[numId].levels && numbering[numId].levels[level]) {
        const levelInfo = numbering[numId].levels[level];

        if (levelInfo.format === 'decimal' || levelInfo.format === 'lowerLetter' ||
            levelInfo.format === 'upperLetter' || levelInfo.format === 'lowerRoman' ||
            levelInfo.format === 'upperRoman') {
            listType = 'number';
        }

        listSymbol = levelInfo.text || listSymbol;
        listStyleClass = levelInfo.class || '';
    }

    // 构建列表项内容
    const rElements = pElement.elements.filter(e => e.name === 'w:r');
    for (const rElement of rElements) {
        listContent += parseRun(rElement, false, relationships, mediaFiles, chartData, chartRelationships, zip);
    }

    // 处理超链接
    const hyperlinkElements = pElement.elements.filter(e => e.name === 'w:hyperlink');
    for (const hyperlink of hyperlinkElements) {
        if (hyperlink.elements) {
            const linkRuns = hyperlink.elements.filter(e => e.name === 'w:r');
            for (const run of linkRuns) {
                listContent += parseRun(run, true, relationships, mediaFiles, chartData, chartRelationships, zip);
            }
        }
    }

    // 应用列表样式
    const listStyleAttribute = listStyleClass ? ` class="${listStyleClass}"` : '';

    // 返回格式化的列表项
    if (listType === 'number') {
        // 有序列表
        return `<li${listStyleAttribute}>${listContent}</li>`;
    } else {
        // 无序列表（项目符号）
        return `<li${listStyleAttribute}>${listContent}</li>`;
    }
}

/**
 * 解析样式定义
 */
function parseStyles(stylesObj) {
    const styles = {};

    if (!stylesObj || !stylesObj.elements) {
        return styles;
    }

    // 找到styles元素
    const stylesElement = findElementByName(stylesObj.elements, 'w:styles');
    if (!stylesElement || !stylesElement.elements) {
        return styles;
    }

    // 记录默认样式ID
    let defaultParaStyleId = null;
    let defaultTableStyleId = null;
    let defaultCharStyleId = null;

    // 先查找默认样式
    const defaultStyleElements = stylesElement.elements.filter(e => e.name === 'w:docDefaults');
    for (const defaultStyle of defaultStyleElements) {
        if (defaultStyle.elements) {
            const pPrDefault = findElementByName(defaultStyle.elements, 'w:pPrDefault');
            if (pPrDefault && pPrDefault.elements) {
                // 处理默认段落样式
                const pPr = findElementByName(pPrDefault.elements, 'w:pPr');
                if (pPr && pPr.elements) {
                    styles['default-paragraph'] = parseStyleProperties(pPr);
                }
            }

            const rPrDefault = findElementByName(defaultStyle.elements, 'w:rPrDefault');
            if (rPrDefault && rPrDefault.elements) {
                // 处理默认文本样式
                const rPr = findElementByName(rPrDefault.elements, 'w:rPr');
                if (rPr && rPr.elements) {
                    styles['default-character'] = parseCharacterStyleProperties(rPr);
                }
            }
        }
    }

    // 查找所有style元素
    const styleElements = stylesElement.elements.filter(e => e.name === 'w:style');
    for (const style of styleElements) {
        if (style.attributes && style.attributes['w:styleId']) {
            const styleId = style.attributes['w:styleId'];
            let styleCSS = '';

            // 检查样式类型
            const styleType = style.attributes['w:type'];
            // console.log('处理样式:', styleId, '类型:', styleType);

            // 处理默认样式标记
            if (style.attributes['w:default'] === '1') {
                if (styleType === 'paragraph') {
                    defaultParaStyleId = styleId;
                } else if (styleType === 'table') {
                    defaultTableStyleId = styleId;
                } else if (styleType === 'character') {
                    defaultCharStyleId = styleId;
                }
            }

            // 解析段落样式
            const pPrElement = findElementByName(style.elements, 'w:pPr');
            if (pPrElement && pPrElement.elements) {
                styleCSS += parseStyleProperties(pPrElement);
            }

            // 解析字符样式
            const rPrElement = findElementByName(style.elements, 'w:rPr');
            if (rPrElement && rPrElement.elements) {
                styleCSS += parseCharacterStyleProperties(rPrElement);
            }

            // 处理样式基础继承
            const basedOnElement = findElementByName(style.elements, 'w:basedOn');
            if (basedOnElement && basedOnElement.attributes && basedOnElement.attributes['w:val']) {
                const baseStyleId = basedOnElement.attributes['w:val'];
                if (styles[baseStyleId]) {
                    // 基础样式已经解析过，可以直接在前面添加
                    styleCSS = styles[baseStyleId] + styleCSS;
                }
            }

            styles[styleId] = styleCSS;
        }
    }

    // 记录默认样式ID
    if (defaultParaStyleId) styles['default-paragraph-id'] = defaultParaStyleId;
    if (defaultTableStyleId) styles['default-table-id'] = defaultTableStyleId;
    if (defaultCharStyleId) styles['default-character-id'] = defaultCharStyleId;

    return styles;
}

/**
 * 解析段落样式属性
 */
function parseStyleProperties(pPrElement) {
    let styleCSS = '';

    // 对齐
    const jcElement = findElementByName(pPrElement.elements, 'w:jc');
    if (jcElement && jcElement.attributes && jcElement.attributes['w:val']) {
        const alignment = jcElement.attributes['w:val'];
        styleCSS += `text-align: ${alignment};`;
    }

    // 缩进
    const indElement = findElementByName(pPrElement.elements, 'w:ind');
    if (indElement && indElement.attributes) {
        if (indElement.attributes['w:left']) {
            styleCSS += `margin-left: ${parseFloat(indElement.attributes['w:left']) / 20}px;`;
        }
        if (indElement.attributes['w:right']) {
            styleCSS += `margin-right: ${parseFloat(indElement.attributes['w:right']) / 20}px;`;
        }
        if (indElement.attributes['w:firstLine']) {
            styleCSS += `text-indent: ${parseFloat(indElement.attributes['w:firstLine']) / 20}px;`;
        }
    }

    // 间距
    const spacingElement = findElementByName(pPrElement.elements, 'w:spacing');
    if (spacingElement && spacingElement.attributes) {
        if (spacingElement.attributes['w:before']) {
            styleCSS += `margin-top: ${parseFloat(spacingElement.attributes['w:before']) / 20}px;`;
        }
        if (spacingElement.attributes['w:after']) {
            styleCSS += `margin-bottom: ${parseFloat(spacingElement.attributes['w:after']) / 20}px;`;
        }
        if (spacingElement.attributes['w:line']) {
            // Word中的行距计算比较复杂，这里简化处理
            const lineHeight = parseFloat(spacingElement.attributes['w:line']) / 240; // 近似转换
            styleCSS += `line-height: ${lineHeight};`;
        }
    }

    // 边框
    const pBdrElement = findElementByName(pPrElement.elements, 'w:pBdr');
    if (pBdrElement && pBdrElement.elements) {
        const sides = ['top', 'right', 'bottom', 'left'];
        for (const side of sides) {
            const borderElement = findElementByName(pBdrElement.elements, `w:${side}`);
            if (borderElement && borderElement.attributes) {
                let borderStyle = 'solid';
                if (borderElement.attributes['w:val'] === 'double') {
                    borderStyle = 'double';
                } else if (borderElement.attributes['w:val'] === 'dashed') {
                    borderStyle = 'dashed';
                } else if (borderElement.attributes['w:val'] === 'dotted') {
                    borderStyle = 'dotted';
                }

                let width = '1px';
                if (borderElement.attributes['w:sz']) {
                    width = `${parseInt(borderElement.attributes['w:sz']) / 8}px`;
                }

                let color = '#000000';
                if (borderElement.attributes['w:color']) {
                    color = `#${borderElement.attributes['w:color']}`;
                    if (borderElement.attributes['w:color'] === 'auto') {
                        color = 'inherit';
                    }
                }

                styleCSS += `border-${side}: ${width} ${borderStyle} ${color};`;
            }
        }
    }

    // 背景颜色
    const shdElement = findElementByName(pPrElement.elements, 'w:shd');
    if (shdElement && shdElement.attributes && shdElement.attributes['w:fill'] &&
        shdElement.attributes['w:fill'] !== 'auto') {
        styleCSS += `background-color: #${shdElement.attributes['w:fill']};`;
    }

    return styleCSS;
}

/**
 * 解析字符样式属性
 */
function parseCharacterStyleProperties(rPrElement) {
    let styleCSS = '';

    // 粗体
    if (findElementByName(rPrElement.elements, 'w:b')) {
        styleCSS += 'font-weight: bold;';
    }

    // 斜体
    if (findElementByName(rPrElement.elements, 'w:i')) {
        styleCSS += 'font-style: italic;';
    }

    // 下划线
    const uElement = findElementByName(rPrElement.elements, 'w:u');
    if (uElement && uElement.attributes && uElement.attributes['w:val']) {
        const underlineType = uElement.attributes['w:val'];

        if (underlineType === 'single') {
            styleCSS += 'text-decoration: underline;';
        } else if (underlineType === 'double') {
            styleCSS += 'text-decoration: underline; text-decoration-style: double;';
        } else if (underlineType === 'dotted') {
            styleCSS += 'text-decoration: underline; text-decoration-style: dotted;';
        } else if (underlineType === 'dash' || underlineType === 'dashed') {
            styleCSS += 'text-decoration: underline; text-decoration-style: dashed;';
        } else if (underlineType === 'wave') {
            styleCSS += 'text-decoration: underline wavy;';
        } else if (underlineType === 'none') {
            styleCSS += 'text-decoration: none;';
        }
    }

    // 字体大小
    const szElement = findElementByName(rPrElement.elements, 'w:sz');
    if (szElement && szElement.attributes && szElement.attributes['w:val']) {
        const fontSize = parseInt(szElement.attributes['w:val']) / 2;
        styleCSS += `font-size: ${fontSize}pt;`;
    }

    // 字体
    const rFontsElement = findElementByName(rPrElement.elements, 'w:rFonts');
    if (rFontsElement && rFontsElement.attributes) {
        const fontFamilies = [];

        if (rFontsElement.attributes['w:ascii']) {
            fontFamilies.push(`"${rFontsElement.attributes['w:ascii']}"`);
        }

        if (rFontsElement.attributes['w:eastAsia'] &&
            (!rFontsElement.attributes['w:ascii'] ||
                rFontsElement.attributes['w:eastAsia'] !== rFontsElement.attributes['w:ascii'])) {
            fontFamilies.push(`"${rFontsElement.attributes['w:eastAsia']}"`);
        }

        if (rFontsElement.attributes['w:hAnsi'] &&
            !fontFamilies.includes(`"${rFontsElement.attributes['w:hAnsi']}"`) &&
            !fontFamilies.includes(`"${rFontsElement.attributes['w:eastAsia']}"`) &&
            !fontFamilies.includes(`"${rFontsElement.attributes['w:ascii']}"`)) {
            fontFamilies.push(`"${rFontsElement.attributes['w:hAnsi']}"`);
        }

        if (fontFamilies.length > 0) {
            fontFamilies.push('sans-serif');
            styleCSS += `font-family: ${fontFamilies.join(', ')};`;
        }
    }

    // 文本颜色
    const colorElement = findElementByName(rPrElement.elements, 'w:color');
    if (colorElement && colorElement.attributes && colorElement.attributes['w:val'] &&
        colorElement.attributes['w:val'] !== 'auto') {
        styleCSS += `color: #${colorElement.attributes['w:val']};`;
    }

    // 高亮
    const highlightElement = findElementByName(rPrElement.elements, 'w:highlight');
    if (highlightElement && highlightElement.attributes && highlightElement.attributes['w:val']) {
        const colorMap = {
            'yellow': '#FFFF00',
            'green': '#00FF00',
            'cyan': '#00FFFF',
            'magenta': '#FF00FF',
            'blue': '#0000FF',
            'red': '#FF0000',
            'darkBlue': '#000080',
            'darkCyan': '#008080',
            'darkGreen': '#008000',
            'darkMagenta': '#800080',
            'darkRed': '#800000',
            'darkYellow': '#808000',
            'darkGray': '#808080',
            'lightGray': '#C0C0C0',
            'black': '#000000'
        };

        const highlightColor = highlightElement.attributes['w:val'];
        const bgColor = colorMap[highlightColor] || highlightColor;
        styleCSS += `background-color: ${bgColor};`;
    }

    return styleCSS;
}

/**
 * 解析编号定义（列表）
 */
function parseNumbering(numberingObj) {
    const numbering = {};

    if (!numberingObj || !numberingObj.elements) {
        return numbering;
    }

    // 找到numbering元素
    const numberingElement = findElementByName(numberingObj.elements, 'w:numbering');
    if (!numberingElement || !numberingElement.elements) {
        return numbering;
    }

    // 解析抽象编号定义
    const abstractNums = numberingElement.elements.filter(e => e.name === 'w:abstractNum');

    for (const abstractNum of abstractNums) {
        if (abstractNum.attributes && abstractNum.attributes['w:abstractNumId']) {
            const abstractNumId = abstractNum.attributes['w:abstractNumId'];
            const levels = {};

            // 解析级别定义
            const lvls = abstractNum.elements.filter(e => e.name === 'w:lvl');
            for (const lvl of lvls) {
                if (lvl.attributes && lvl.attributes['w:ilvl'] !== undefined) {
                    const ilvl = lvl.attributes['w:ilvl'];
                    let levelInfo = {
                        format: 'bullet', // 默认为无序列表
                        text: '•'
                    };

                    // 列表类型
                    const numFmtElement = findElementByName(lvl.elements, 'w:numFmt');
                    if (numFmtElement && numFmtElement.attributes && numFmtElement.attributes['w:val']) {
                        const format = numFmtElement.attributes['w:val'];
                        levelInfo.format = format;

                        // 根据格式设置默认文本
                        switch (format) {
                            case 'decimal':
                                levelInfo.text = '%1.';
                                break;
                            case 'lowerLetter':
                                levelInfo.text = '%1)';
                                break;
                            case 'upperLetter':
                                levelInfo.text = '%1.';
                                break;
                            case 'lowerRoman':
                                levelInfo.text = '%1.';
                                break;
                            case 'upperRoman':
                                levelInfo.text = '%1.';
                                break;
                        }
                    }

                    // 列表文本
                    const lvlTextElement = findElementByName(lvl.elements, 'w:lvlText');
                    if (lvlTextElement && lvlTextElement.attributes && lvlTextElement.attributes['w:val']) {
                        levelInfo.text = lvlTextElement.attributes['w:val'];
                    }

                    levels[ilvl] = levelInfo;
                }
            }

            numbering[abstractNumId] = { levels };
        }
    }

    // 解析具体编号实例
    const nums = numberingElement.elements.filter(e => e.name === 'w:num');
    for (const num of nums) {
        if (num.attributes && num.attributes['w:numId']) {
            const numId = num.attributes['w:numId'];

            // 获取对应的抽象编号ID
            const abstractNumIdElement = findElementByName(num.elements, 'w:abstractNumId');
            if (abstractNumIdElement && abstractNumIdElement.attributes && abstractNumIdElement.attributes['w:val']) {
                const abstractNumId = abstractNumIdElement.attributes['w:val'];

                // 复制抽象编号定义到具体编号实例
                if (numbering[abstractNumId]) {
                    numbering[numId] = numbering[abstractNumId];
                }
            }
        }
    }

    return numbering;
}

/**
 * 解析图表数据并转换为HTML
 */
function parseChart(chartId, chartData, chartRelationships, mediaFiles, zip) {
    if (!chartId || !chartData) {
        return '<div class="chart-error">无法加载图表数据</div>';
    }

    try {
        // 尝试从chartData中获取预渲染的图表图片
        if (chartRelationships && chartRelationships[chartId]) {
            const chartRelObj = chartRelationships[chartId];
            let chartImageId = '';

            // 查找图表的图像关系
            if (chartRelObj && chartRelObj.elements && chartRelObj.elements[0] &&
                chartRelObj.elements[0].elements) {

                for (const rel of chartRelObj.elements[0].elements) {
                    if (rel.attributes && rel.attributes.Type &&
                        rel.attributes.Type.includes('image') &&
                        rel.attributes.Target) {

                        const target = rel.attributes.Target;
                        if (target.startsWith('../media/') || target.startsWith('media/')) {
                            // 从Target中提取文件名
                            const fileName = target.split('/').pop();
                            if (mediaFiles[fileName]) {
                                // 生成base64数据URL
                                const imageData = mediaFiles[fileName];
                                const mimeType = getMimeTypeFromFileName(fileName);
                                const base64Data = imageData.toString('base64');

                                return `<img src="data:${mimeType};base64,${base64Data}" 
                                     class="embedded-chart" alt="嵌入图表" />`;
                            }
                        }
                    }
                }
            }
        }

        // 如果找不到预渲染图像，尝试解析图表数据
        const chartObj = chartData[chartId];
        if (chartObj && chartObj.elements) {
            let chartTitle = '图表';
            let chartType = '未知类型';

            // 尝试提取图表标题
            try {
                const chartElement = findElementByName(chartObj.elements, 'c:chart');
                if (chartElement && chartElement.elements) {
                    const titleElement = findElementByName(chartElement.elements, 'c:title');
                    if (titleElement && titleElement.elements) {
                        const txElement = findElementByName(titleElement.elements, 'c:tx');
                        if (txElement && txElement.elements) {
                            const strRefElement = findElementByName(txElement.elements, 'c:strRef');
                            if (strRefElement && strRefElement.elements) {
                                const strElement = findElementByName(strRefElement.elements, 'c:str');
                                if (strElement && strElement.elements) {
                                    for (const textNode of strElement.elements) {
                                        if (textNode.type === 'text' && textNode.text) {
                                            chartTitle = textNode.text;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // 尝试确定图表类型
                const plotAreaElement = findElementByName(chartElement.elements, 'c:plotArea');
                if (plotAreaElement && plotAreaElement.elements) {
                    // 查找各种图表类型元素
                    if (findElementByName(plotAreaElement.elements, 'c:barChart')) {
                        chartType = '柱状图';
                    } else if (findElementByName(plotAreaElement.elements, 'c:pieChart')) {
                        chartType = '饼图';
                    } else if (findElementByName(plotAreaElement.elements, 'c:lineChart')) {
                        chartType = '折线图';
                    } else if (findElementByName(plotAreaElement.elements, 'c:areaChart')) {
                        chartType = '面积图';
                    } else if (findElementByName(plotAreaElement.elements, 'c:scatterChart')) {
                        chartType = '散点图';
                    } else if (findElementByName(plotAreaElement.elements, 'c:doughnutChart')) {
                        chartType = '环形图';
                    } else if (findElementByName(plotAreaElement.elements, 'c:radarChart')) {
                        chartType = '雷达图';
                    } else if (findElementByName(plotAreaElement.elements, 'c:surface3DChart')) {
                        chartType = '3D表面图';
                    }
                }
            } catch (error) {
                console.error('提取图表信息失败:', error);
            }

            // 返回占位符
            return `
            <div class="chart-placeholder">
                <h4>${chartTitle}</h4>
                <p>图表类型: ${chartType}</p>
                <p>此处应显示图表内容。在Word中查看完整图表。</p>
            </div>
        `;
        }

        return '<div class="chart-error">无法解析图表数据</div>';
    } catch (error) {
        console.error('解析图表失败:', error);
        return '<div class="chart-error">图表处理出错</div>';
    }
}

/**
 * 处理嵌入的图片，将它们转换为base64
 */
function processEmbeddedImages(html, relationships, mediaFiles) {
    if (!html || !relationships || !mediaFiles) {
        return html;
    }

    let processedHtml = html;
    let processedImageCount = 0;
    let missingImageCount = 0;
    let errorImageCount = 0;

    // 匹配所有包含data-docx-image-id的img标签
    processedHtml = processedHtml.replace(/<img[^>]*data-docx-image-id="([^"]+)"[^>]*>/g, (match, imageId) => {
        try {
            // 提取标签中的所有属性
            const attributes = match.replace(/<img|\/>|>/g, '')
                .replace(/data-docx-image-id="([^"]+)"/g, '')
                .trim();

            if (!relationships[imageId]) {
                console.warn(`找不到图片关系: ${imageId}`);
                missingImageCount++;
                return `<span style="color: red; border: 1px dashed #999; padding: 2px; display: inline-block;">[找不到图片关系: ${imageId}]</span>`;
            }

            const imagePath = relationships[imageId].target;
            let fileName = '';

            // 处理路径，去掉开头的"../"或"media/"等，只保留文件名
            if (imagePath.includes('/')) {
                fileName = imagePath.split('/').pop();
            } else {
                fileName = imagePath;
            }

            // 如果文件名中包含非法字符，清理一下
            fileName = fileName.replace(/[?#]/g, '');

            // 在媒体文件中查找匹配
            let imageData = mediaFiles[fileName];

            // 如果没有直接匹配，尝试其他匹配方式
            if (!imageData) {
                // 尝试在mediaFiles中查找包含文件名的键
                const possibleKeys = Object.keys(mediaFiles).filter(key =>
                    key.includes(fileName) || fileName.includes(key)
                );

                if (possibleKeys.length > 0) {
                    // 使用第一个匹配项
                    fileName = possibleKeys[0];
                    imageData = mediaFiles[fileName];
                } else {
                    // 尝试通过扩展名查找 (例如.png, .jpeg等)
                    const extension = fileName.split('.').pop().toLowerCase();
                    if (extension) {
                        // 查找具有相同扩展名的第一个文件
                        const sameExtKeys = Object.keys(mediaFiles).filter(key =>
                            key.toLowerCase().endsWith(`.${extension}`)
                        );

                        if (sameExtKeys.length > 0) {
                            // 使用具有相同扩展名的第一个文件
                            console.warn(`无法找到精确匹配的图片 ${fileName}，使用同类型图片 ${sameExtKeys[0]} 代替`);
                            fileName = sameExtKeys[0];
                            imageData = mediaFiles[fileName];
                        }
                    }
                }
            }

            // 如果仍然找不到图片数据
            if (!imageData) {
                console.warn(`找不到图片文件: ${fileName} (ID: ${imageId})`);
                missingImageCount++;
                return `<span style="color: red; border: 1px dashed #999; padding: 2px; display: inline-block;">[找不到图片文件: ${fileName}]</span>`;
            }

            // 确定MIME类型
            const mimeType = getMimeTypeFromFileName(fileName);

            // 转换为base64
            const base64Data = imageData.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64Data}`;

            processedImageCount++;
            // 返回带有base64数据的img标签
            return `<img src="${dataUrl}" ${attributes}>`;
        } catch (error) {
            console.error('处理图片失败:', error, '图片ID:', imageId);
            errorImageCount++;
            return `<span style="color: red; border: 1px dashed #999; padding: 2px; display: inline-block;">[图片处理错误: ${error.message}]</span>`;
        }
    });

    // 输出处理统计
    console.log(`图片处理统计：处理成功 ${processedImageCount}，缺失 ${missingImageCount}，错误 ${errorImageCount}`);

    return processedHtml;
}

/**
 * 从文件名获取MIME类型
 */
function getMimeTypeFromFileName(fileName) {
    if (!fileName) return 'application/octet-stream';

    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'svg': return 'image/svg+xml';
        case 'webp': return 'image/webp';
        case 'bmp': return 'image/bmp';
        case 'tiff':
        case 'tif': return 'image/tiff';
        case 'wmf': return 'image/wmf';
        case 'emf': return 'image/emf';
        default: return 'application/octet-stream';
    }
}

// 导出模块
module.exports = {
    docxToHtmlQuill
};