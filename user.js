const db = require("./database");

const init = async () => {
  // To achieve a multi level connection furthe we need to modify the database schema and the query accordingly.
  // So we may create separate tables for different levels of connections  (horizontal partitioning).
  await db.run(
    "CREATE TABLE Users (id INTEGER PRIMARY KEY AUTOINCREMENT, name varchar(32));"
  );
  await db.run(
    "CREATE TABLE Friends (id INTEGER PRIMARY KEY AUTOINCREMENT, userId int, friendId int);"
  );
  await db.run("CREATE INDEX IF NOT EXISTS idx_users_name ON Users(name);");
  await db.run(
    "CREATE INDEX IF NOT EXISTS idx_friends_userId ON Friends(userId);"
  );
  await db.run(
    "CREATE INDEX IF NOT EXISTS idx_friends_friendId ON Friends(friendId);"
  );

  const users = [];
  const names = ["foo", "bar", "baz"];
  for (i = 0; i < 27000; ++i) {
    let n = i;
    let name = "";
    for (j = 0; j < 3; ++j) {
      name += names[n % 3];
      n = Math.floor(n / 3);
      name += n % 10;
      n = Math.floor(n / 10);
    }
    users.push(name);
  }
  const friends = users.map(() => []);
  for (i = 0; i < friends.length; ++i) {
    const n = 10 + Math.floor(90 * Math.random());
    const list = [...Array(n)].map(() =>
      Math.floor(friends.length * Math.random())
    );
    list.forEach((j) => {
      if (i === j) {
        return;
      }
      if (friends[i].indexOf(j) >= 0 || friends[j].indexOf(i) >= 0) {
        return;
      }
      friends[i].push(j);
      friends[j].push(i);
    });
  }

  console.log("Init Users Table...");
  await Promise.all(
    users.map((un) => db.run(`INSERT INTO Users (name) VALUES ('${un}');`))
  );

  console.log("Init Friends Table...");
  await Promise.all(
    friends.map((list, i) => {
      return Promise.all(
        list.map((j) =>
          db.run(
            `INSERT INTO Friends (userId, friendId) VALUES (${i + 1}, ${
              j + 1
            });`
          )
        )
      );
    })
  );
  console.log("Ready.");
};
module.exports.init = init;

const searchOld = async (req, res) => {
  const query = req.params.query;
  const userId = parseInt(req.params.userId);

  // if used parameterized queries, which helps prevent SQL injection
  db.all(
    `SELECT id, name, id in (SELECT friendId from Friends where userId = ${userId}) as connection from Users where name LIKE '${query}%' LIMIT 20;`
  )
    .then((results) => {
      res.statusCode = 200;
      res.json({
        success: true,
        users: results,
      });
    })
    .catch((err) => {
      res.statusCode = 500;
      res.json({ success: false, error: err });
    });
};
module.exports.searchOld = searchOld;

const addFriend = async (req, res) => {
  const userId = parseInt(req.params.userId);
  const friendId = parseInt(req.params.friendId);

  try {
    // if used parameterized queries, which helps prevent SQL injection
    await db.run(
      `INSERT INTO Friends (userId, friendId) VALUES (${userId}, ${friendId});`
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error adding friend." });
  }
};

module.exports.addFriend = addFriend;

const removeFriend = async (req, res) => {
  const userId = parseInt(req.params.userId);
  const friendId = parseInt(req.params.friendId);

  try {
    // if used parameterized queries, which helps prevent SQL injection
    await db.run(
      `DELETE FROM Friends WHERE userId = ${userId} AND friendId = ${friendId};`
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error removing friend." });
  }
};

module.exports.removeFriend = removeFriend;

const search = async (req, res) => {
  const query = req.params.query;
  const userId = parseInt(req.params.userId);
  // we can use caching (node-cache or memory-cache) for frequently accessed data to reduce database queries.

  try {
    const results = await db.all(`
          SELECT DISTINCT U.id, U.name,
          CASE
            WHEN F.friendId IS NOT NULL THEN
              CASE
                WHEN F.userId = ${userId} THEN 1  -- Direct friend
                WHEN F2.friendId IS NOT NULL THEN 2  -- Friend of a friend
                WHEN F3.friendId IS NOT NULL THEN 3  -- Friend of a friend of a friend
                ELSE 0  -- Other connections
              END
            ELSE 0  -- Not a friend
          END AS connection
        FROM Users U
        LEFT JOIN Friends F ON U.id = F.friendId AND (F.userId = ${userId} OR F.friendId = ${userId})
        LEFT JOIN Friends F2 ON U.id = F2.friendId
        LEFT JOIN Friends F3 ON U.id = F3.friendId AND F3.userId <> ${userId}  -- Exclude direct friends
        WHERE U.name LIKE '${query}%'
        LIMIT 20;`);

    // if used parameterized queries, which helps prevent SQL injection
    // const results = await db.all(sqlQuery, params);
    res.statusCode = 200;
    res.json({
      success: true,
      users: results,
    });
  } catch (err) {
    console.error("Errror --- ", err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

module.exports.search = search;
