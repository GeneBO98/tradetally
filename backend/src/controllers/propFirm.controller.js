const PropFirmService = require('../services/propFirmService');

const propFirmController = {
  // GET /api/prop-firm/profiles - profiles with live rule status
  async listProfiles(req, res, next) {
    try {
      const profiles = await PropFirmService.listProfilesWithStatus(req.user.id);
      res.json({ profiles });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/prop-firm/profiles
  async createProfile(req, res, next) {
    try {
      const profile = await PropFirmService.createProfile(req.user.id, req.body);
      res.status(201).json({ profile });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A rule profile already exists for this account' });
      }
      next(error);
    }
  },

  // PUT /api/prop-firm/profiles/:id
  async updateProfile(req, res, next) {
    try {
      const profile = await PropFirmService.updateProfile(req.params.id, req.user.id, req.body);
      if (!profile) {
        return res.status(404).json({ error: 'Rule profile not found' });
      }
      res.json({ profile });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A rule profile already exists for this account' });
      }
      next(error);
    }
  },

  // DELETE /api/prop-firm/profiles/:id
  async deleteProfile(req, res, next) {
    try {
      const deleted = await PropFirmService.deleteProfile(req.params.id, req.user.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Rule profile not found' });
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
};

module.exports = propFirmController;
