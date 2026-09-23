// Middleware to check roles and permissions

const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (allowedRoles.includes(req.user.role)) {
            return next();
        }
        return res.status(403).json({ error: 'Permission denied for this role' });
    };
};

const requireInchargeOrAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.role === 'admin' || (req.user.role === 'teacher' && req.user.is_incharge === 1)) {
        return next();
    }
    return res.status(403).json({ error: 'Student management is restricted to Class Incharge or Admin users' });
};

module.exports = {
    requireRole,
    requireInchargeOrAdmin
};
