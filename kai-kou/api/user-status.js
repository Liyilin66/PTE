export default function handler(_req, res) {
  res.status(200).json({
    code: 0,
    data: {
      id: "mock-user-001",
      loggedIn: false,
      scoreBand: "47-50",
      dailyTarget: 3,
      dailyDone: 0
    }
  });
}
