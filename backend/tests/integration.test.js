/**
 * Integration test scaffold:
 * - These tests avoid calling external OpenAI; they test admin endpoints and tools.
 * - For full integration mock OpenAI client or use recorded fixtures.
 */
const request = require('supertest');
const express = require('express');

test('admin stats endpoint returns JSON', async () => {
  const app = express();
  app.get('/api/admin/stats', (req,res) => res.json({ uptime: 123, memoryCount: 0 }));
  const res = await request(app).get('/api/admin/stats');
  expect(res.statusCode).toBe(200);
  expect(res.body).toHaveProperty('uptime');
});

test('tools calc endpoint', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/tools/calc', (req,res)=>{
    if (!req.body.expr) return res.status(400).json({error:'expr required'});
    return res.json({result: 4});
  });
  const res = await request(app).post('/api/tools/calc').send({expr:'2+2'});
  expect(res.statusCode).toBe(200);
  expect(res.body.result).toBe(4);
});
