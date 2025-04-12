const jwt = require('jsonwebtoken');

const verifyToken = (roles = []) => {
  return (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.redirect('/login');

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err || (roles.length && !roles.includes(decoded.role))) {
        return res.status(403).send("Access denied.");
      }
      req.user = decoded;
      next();
    });
  };
};

module.exports = verifyToken;
