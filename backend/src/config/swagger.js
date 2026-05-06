const swaggerUi = require('swagger-ui-express');
const generatedSpec = require('./swagger-spec.generated.json');

function buildSwaggerSpec() {
  return {
    ...generatedSpec,
    servers: [
      {
        url: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
        description: 'Development server',
      },
    ],
  };
}

module.exports = {
  swaggerSpec: buildSwaggerSpec(),
  swaggerUi,
};
