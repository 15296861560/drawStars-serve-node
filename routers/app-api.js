const express = require('express')
const router = express.Router()
const db = require('../public/db/mysql/base')

const CommoModel = require('../public/provider/common')
const AppModel = new CommoModel('apps', ['status', 'category'], ['name', 'description']);

// 查询应用列表
router.get('/list', async (req, res) => {
    try {
        const { curPage, pageSize, name, status, category } = req.query;
        const query = {
            name,
            status,
            category
        }

        const [records, total] = await Promise.all([
            AppModel.find({
                ...query,
                sort: { create_time: -1 },
                skip: (curPage - 1) * pageSize,
                limit: pageSize
            }),
            AppModel.countDocuments(query)
        ])

        res.json({
            status: true,
            data: {
                records,
                total
            }
        });
    } catch (error) {
        res.status(500).json({ status: false, msg: error.message });
    }
});


// 获取应用详情
router.get('/detail/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await AppModel.findById(id);
        res.json({ status: true, data: result });
    } catch (error) {
        res.status(500).json({ status: false, msg: error.message });
    }
});

// 创建应用
router.post('/create', async (req, res) => {
    try {
        const result = await AppModel.create(req.body);
        res.json({ status: true, data: result.insertId });
    } catch (error) {
        res.status(500).json({ status: false, msg: error.message });
    }
});

// 更新应用
router.put('/update', async (req, res) => {
    try {

        const updateData = {
            ...req.body
        }
        delete updateData.id
        const result = await AppModel.update(updateData, req.body.id);
        res.json({ status: true, data: result });
    } catch (error) {
        res.status(500).json({ status: false, msg: error.message });
    }
});

// 删除应用
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await AppModel.deleteById(id);
        res.json({ status: true, data: result });
    } catch (error) {
        res.status(500).json({ status: false, msg: error.message });
    }
});

// 批量删除应用
router.delete('/batchDelete', async (req, res) => {
    try {
        const { ids } = req.body;
        const result = await db.selectData('DELETE FROM apps WHERE id IN (?)', [ids]);
        res.json({ status: true, data: result });
    } catch (error) {
        res.status(500).json({ status: false, msg: error.message });
    }
});

// 更新应用
router.post('/upgrade/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { version, file_path } = req.body;
        const result = await AppModel.update({ version, file_path }, id);
        res.json({ status: true, data: result });
    } catch (error) {
        res.status(500).json({ status: false, msg: error.message });
    }
});

// 发布应用
router.post('/publish/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.selectData('UPDATE apps SET status = "published" WHERE id = ?', [id]);
        res.json({ status: true, data: result });
    } catch (error) {
        res.status(500).json({ status: false, msg: error.message });
    }
});

module.exports = router;