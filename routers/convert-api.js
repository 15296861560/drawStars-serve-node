const express = require('express')
const router = express.Router()
const multer = require('multer')

const ConvertProvider = require("../public/provider/convert/convertProvider.js")

// 配置文件上传
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 限制10MB
    },
    fileFilter: (req, file, cb) => {
        // 只接受.docx文件
        if (file.originalname.endsWith('.docx')) {
            return cb(null, true);
        }
        cb(new Error('只接受.docx格式的Word文档'));
    }
});


// 处理Word文档上传并转换为HTML
router.post('/convert', upload.single('docxFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: false, msg: '未上传文件' });
        }

        // 从请求中获取上传的文件
        const docxBuffer = req.file.buffer;

        // 调用转换函数
        const result = await ConvertProvider.docxToHtml(docxBuffer);

        // 返回HTML内容
        res.json({
            html: result.html
        });
    } catch (error) {
        console.error('处理文件失败:', error);
        res.status(500).json({ status: false, msg: '处理文件失败: ' + error.message });
    }
});

router.post('/convertQuill', upload.single('docxFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: false, msg: '未上传文件' });
        }

        // 从请求中获取上传的文件
        const docxBuffer = req.file.buffer;

        // 调用转换函数
        const result = await ConvertProvider.docxToHtmlQuill(docxBuffer);

        // 返回HTML内容
        res.json({
            html: result.html
        });
    } catch (error) {
        console.error('处理文件失败:', error);
        res.status(500).json({ status: false, msg: '处理文件失败: ' + error.message });
    }
});

router.post('/convertMammoth', upload.single('docxFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: false, msg: '未上传文件' });
        }

        // 从请求中获取上传的文件
        const docxBuffer = req.file.buffer;

        // 返回HTML内容
        res.json({
            html: await ConvertProvider.mammothToHtml(docxBuffer)
        });
    } catch (error) {
        console.error('处理文件失败:', error);
        res.status(500).json({ status: false, msg: '处理文件失败: ' + error.message });
    }
});

module.exports = router