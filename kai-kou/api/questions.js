export default function handler(_req, res) {
  res.status(200).json({
    code: 0,
    data: {
      ra: [
        {
          id: "ra-001",
          text: "The rapid advancement of artificial intelligence has transformed numerous industries including healthcare education and transportation with machine learning algorithms now capable of diagnosing diseases recommending personalized learning paths and optimizing traffic patterns in real time."
        }
      ],
      rs: [
        {
          id: "rs-001",
          audio: "/mock/rs-001.mp3",
          transcript: "Students should review lecture notes after each class."
        }
      ],
      rl: [
        {
          id: "rl-001",
          audio: "/mock/rl-001.mp3",
          template:
            "The lecture mainly discusses [TOPIC]. The speaker first mentions [POINT 1], then explains [POINT 2], and finally concludes that [CONCLUSION]."
        }
      ],
      wfd: [
        {
          id: "wfd-001",
          audio: "/mock/wfd-001.mp3",
          answer: "The university library is closed on public holidays."
        }
      ]
    }
  });
}
