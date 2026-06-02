const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');
const generatedSpec = require('./swagger-spec.generated.json');

function mergeComponents(base = {}, annotated = {}) {
  return {
    ...base,
    ...annotated,
    schemas: {
      ...(base.schemas || {}),
      ...(annotated.schemas || {}),
    },
    securitySchemes: {
      ...(base.securitySchemes || {}),
      ...(annotated.securitySchemes || {}),
    },
  };
}

function buildAnnotatedSpec(serverUrl) {
  return swaggerJsdoc({
    definition: {
      openapi: generatedSpec.openapi || '3.0.0',
      info: generatedSpec.info || {
        title: 'TradeTally API',
        version: '1.0.0',
      },
      servers: [
        {
          url: serverUrl,
          description: 'API server',
        },
      ],
    },
    apis: [
      path.join(__dirname, '..', 'routes', '*.js'),
      path.join(__dirname, '..', 'routes', 'v1', '*.js'),
      path.join(__dirname, '..', 'controllers', '*.js'),
    ],
  });
}

function buildSwaggerSpec(serverUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`) {
  const annotatedSpec = buildAnnotatedSpec(serverUrl);

  return {
    ...generatedSpec,
    paths: {
      ...(generatedSpec.paths || {}),
      ...(annotatedSpec.paths || {}),
    },
    components: mergeComponents(generatedSpec.components, annotatedSpec.components),
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
