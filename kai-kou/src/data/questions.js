export const questions = {
  RA: [
    {
      id: "RA_001",
      content:
        "The Great Barrier Reef is the world's largest coral reef system, composed of over 2,900 individual reefs and 900 islands. It stretches for more than 2,300 kilometres and supports extraordinary biodiversity, including many vulnerable species.",
      difficulty: 2,
      wordCount: 47
    },
    {
      id: "RA_002",
      content:
        "Climate change refers to long-term shifts in global temperatures and weather patterns. While some changes are natural, scientific evidence shows that human activities have been the main driver of climate change since the 1800s, primarily due to the burning of fossil fuels.",
      difficulty: 2,
      wordCount: 52
    },
    {
      id: "RA_003",
      content:
        "Australia is the world's sixth largest country by total area. It is the largest country in Oceania and the world's largest country that is also a continent. The population is concentrated mainly in urban areas on the coast.",
      difficulty: 1,
      wordCount: 44
    },
    {
      id: "RA_004",
      content:
        "The human brain contains approximately 86 billion neurons, each connected to thousands of others through synapses. This network processes information at remarkable speed, enabling complex functions like memory, emotion, language, and creative thinking.",
      difficulty: 3,
      wordCount: 40
    },
    {
      id: "RA_005",
      content:
        "Renewable energy sources such as solar, wind, and hydroelectric power are becoming increasingly important in the global effort to reduce carbon emissions. Many countries are investing heavily in these technologies to transition away from fossil fuels.",
      difficulty: 2,
      wordCount: 45
    }
  ],
  RS: [
    {
      id: "RS_001",
      content: "The conference has been postponed until further notice due to unforeseen circumstances.",
      difficulty: 2
    },
    {
      id: "RS_002",
      content: "Students are required to submit their assignments before the end of the semester.",
      difficulty: 1
    },
    {
      id: "RS_003",
      content: "The research findings suggest a strong correlation between regular exercise and improved mental health outcomes.",
      difficulty: 3
    },
    {
      id: "RS_004",
      content: "All library books must be returned within two weeks or a late fee will be charged.",
      difficulty: 1
    },
    {
      id: "RS_005",
      content: "The government announced a new policy to address the rising cost of living in major cities.",
      difficulty: 2
    }
  ],
  RL: [
    {
      id: "RL_001",
      content:
        "Topic: The impact of social media on mental health. Key points: increased anxiety among teenagers, comparison culture, benefits of digital connection, recommendations for healthy usage.",
      difficulty: 2
    },
    {
      id: "RL_002",
      content:
        "Topic: Climate change solutions. Key points: renewable energy transition, carbon pricing, international cooperation, individual lifestyle changes.",
      difficulty: 2
    },
    {
      id: "RL_003",
      content:
        "Topic: The history of the internet. Key points: ARPANET origins in 1969, Tim Berners-Lee invented the World Wide Web in 1989, commercialization in the 1990s, modern impact on society.",
      difficulty: 1
    },
    {
      id: "RL_004",
      content:
        "Topic: Urban transportation planning. Key points: public transit integration, bike-friendly infrastructure, congestion pricing, and long-term sustainability goals.",
      difficulty: 2
    },
    {
      id: "RL_005",
      content:
        "Topic: Artificial intelligence in healthcare. Key points: faster diagnostics, personalized treatment plans, data privacy concerns, and the role of human oversight.",
      difficulty: 3
    }
  ]
};

const lastQuestionByTask = new Map();

export function getRandomQuestion(taskType) {
  const list = questions[taskType] || [];
  if (!list.length) return null;

  if (list.length === 1) {
    return list[0];
  }

  const lastId = lastQuestionByTask.get(taskType);
  let picked = list[Math.floor(Math.random() * list.length)];
  let attempts = 0;

  while (picked.id === lastId && attempts < 5) {
    picked = list[Math.floor(Math.random() * list.length)];
    attempts += 1;
  }

  lastQuestionByTask.set(taskType, picked.id);
  return picked;
}
