export default ({ env }) => ({
  upload: {
    config: {
      provider: "@strapi-community/strapi-provider-upload-google-cloud-storage",
      providerOptions: {
        serviceAccount: {
          type: "service_account",
          project_id: "monnet-social",
          private_key_id: "05ece8289505cead19203f33c6d9dfa453e69125",
          private_key:
            "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCyeHaOPpXTvgOd\nTvoN6b8Bos6pMKRhm7t1eTl4HilxcR1V0qNG63u2CbnhTYq+dUjkE6FX3WQk7S8y\nR9XtGoj82zL9ugCCXvD3+sdD7jbndGdM4p4xkZtb4IISzFGeKBq63hLzepinbdr0\nV3lgFuwn/UiuhQYnwGOOP7MgXmTfQPPuBzJgqKU5guIyGJtAAJwzU6NWM83yPwT1\ni4nRvsvY14LbaCVdOHzq5USi1fLCqo5uYAA60pZ2nSSx49ufqdbUViR0OuXXaWia\n8AnVIapywtxWihtyE2OlT0ABfKnLNt4oNFY0Cmw/g1iDSIfVcta8qAMwOLehjYUg\nQSkV69khAgMBAAECggEAALlhkm8EE3LJAngke8PNSS/UgqtmcK6dqoVw+4EJ04KX\n5yDT60YqKhas2P0ZeUTcucTaSdLlj2B2qXpQ+VA7KpAmyztC5G8yBJuRTUACm9ql\nJFLOEq7qewtfPmgdqP800+Rx82ggWvDkliBjEcX+CXqAXemUbmWxhw1QnYAXN4Wt\nm4QjQ2VN7WoNPifQuzqriePQCLhF0hDXScIC8VWOzlRqQrJi92Jrbvxn3IGwJNSL\npVrz8oeQePgTB1tBe0npmV1Td3dc/BmMVUk4pd1n+6bee7jTWG+qRwHNY58ZKXwK\nAm7hIIgejauLJp4tiMRFQJzpPQkA8OMfgmGNXa4rfQKBgQD6AHJS291NxN+NCacK\nlpNsfoPsYk0es5k5EdhYct/SM51pn0I33TqqfLJtnAIGNWZUH65H5FDC733Q+zar\nQKm2EzyaH7OMwtDoDZPelQ23ML1eBkVSo94U449FK/XNAGpbEKHZGejq/oPeKyxQ\n0ZafbIucHg6u0ngpsDS10ARW5QKBgQC2wKjmtPHcGUf3A6TwKuzjbyiEdabJO5qg\nEkNn6YAX/6tKTje9vtZyK5sKInVF/Ftvl69DObHhIlBY1ZxBvLnMQCtFslDXeK+C\n4L4HENpqGK/sS6OgXEcSlRFZLC6+EPaOWbRyRuZ1BYmjbLuOmDmUkS1QGRI6+YqW\nFCGNcYM5jQKBgQD4kUMaIWMbNNj0uRktzOMNp4jxmheFpBp/hL+vyZ/CtvEXGHLV\napAu/MbHdqsIk0WH9OvqrRaji010YKJNiYBz+RJzR3vVQ8pEP2O7lkXJ05slBmUc\nsrNX354Or5O4XWZh3tqdKkbMh3yDhDeOr6TsJBd3hOciaT9ya7Es6IO4BQKBgQCZ\nTvHh6DVlEIhAffwlxbzH5n408IWkFq5WTjvhtg5RE5fcU9WLBcbcLBx52gJLXbJO\n4Q6T9Jh2ZtTEUR4uP2YWJFaotzf+Ki4COwru3oJ7so4SSjnP0tmEiyzsg5YKuCw9\nqp8npra5wJWAVTzaGHVlXoyGvyF9+8z4rZagE3OkGQKBgFkpdf7FsemHfEDy65J4\ng86qLl21At3IZTbH4nH3hNPnFkJUJG44VK4fcrs6U6+bt5CG8M8GQOwpSGwR7bXW\nI2afq7ijBJmkauroG0HrZ1NDVTqsT/EMTyX9sHflk6WK2WVKWGnCn/jM4FTl73b5\njD1cpL5uDDoOCty6Dj/5OAuo\n-----END PRIVATE KEY-----\n",
          client_email: "strapi-bakend@monnet-social.iam.gserviceaccount.com",
          client_id: "105816270675211996482",
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url:
            "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url:
            "https://www.googleapis.com/robot/v1/metadata/x509/strapi-bakend%40monnet-social.iam.gserviceaccount.com",
          universe_domain: "googleapis.com",
        },
        bucketName: env("GCS_BUCKET_NAME"),
        basePath: env("GCS_BASE_PATH"),
        baseUrl: env("GCS_BASE_URL"),
        publicFiles: env("GCS_PUBLIC_FILES"),
        uniform: env("GCS_UNIFORM"),
      },
    },
  },
});
