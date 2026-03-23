export default function handler(req, res) {
  const { type = "ra" } = req.method === "POST" ? req.body || {} : req.query || {};

  res.status(200).json({
    code: 0,
    data: {
      type,
      total: 5,
      details: [
        { name: "内容完整度", score: 4 },
        { name: "流利度", score: 5 },
        { name: "发音清晰度", score: 4 },
        { name: "语法用词", score: 3 }
      ],
      pass: true
    }
  });
}
