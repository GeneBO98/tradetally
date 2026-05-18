const swaggerUi = require('swagger-ui-express');
const generatedSpec = require('./swagger-spec.generated.json');

function buildSwaggerSpec(serverUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`) {
  return {
    ...generatedSpec,
    servers: [
      {
        url: serverUrl,
        description: 'API server',
      },
    ],
  };
}

module.exports = {
  buildSwaggerSpec,
  swaggerSpec: buildSwaggerSpec(),
  swaggerUi,
};
