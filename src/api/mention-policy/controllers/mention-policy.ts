/**
 * mention-policy controller
 */

import { factories } from "@strapi/strapi";
import FormData from "form-data";
// const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { parse } = require("csv-parse/sync");
const mime = require("mime-types");

async function downloadToBuffer(url) {
  try {
    // Make the request, specifying the response type as 'arraybuffer'
    const response = await axios.get(url, {
      responseType: "arraybuffer",
    });

    // Convert the downloaded data into the Buffer object Strapi needs
    const buffer = Buffer.from(response.data);

    // Get the content-type from the response headers
    const contentType = response.headers["content-type"];

    return { buffer, contentType };
  } catch (error) {
    // Log a more detailed error if axios fails (e.g., 404, network error)
    console.error(`Axios error downloading ${url}:`, error.message);
    // Re-throw the error to be caught by the main try...catch block
    throw new Error(
      `Failed to download image from ${url}. Reason: ${error.message}`
    );
  }
}

const STRAPI_URL = "http://localhost:1337";

async function uploadViaHttpLegacy(filename, buffer, contentType) {
  const form = new FormData();
  form.append("files", buffer, { filename, contentType });

  const headers = form.getHeaders(); // no auth header needed for public
  const { data } = await axios.post(`${STRAPI_URL}/api/upload`, form, {
    headers,
  });
  return Array.isArray(data) ? data.map((f) => f.id) : [];
}

async function uploadFromBuffer(filename, buffer, contentType) {
  const size = buffer.length;
  console.log("FILENAME:", filename, buffer, contentType);
  // Strapi upload service accepts files with `path` or `buffer`.
  const uploaded = await strapi
    .plugin("upload")
    .service("upload")
    .upload({
      data: {}, // optional extra data
      files: {
        name: filename,
        type: contentType,
        size,
        buffer,
      },
    });

  // returns an array of uploaded files (usually length 1 for a single file)
  return uploaded?.[0]?.id ? uploaded.map((f) => f.id) : [];
}

function splitMulti(value) {
  if (!value) return [];
  console.log("SPLIT MULTI:", value);
  // allow | or , as separators
  return String(value)
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default factories.createCoreController(
  "api::mention-policy.mention-policy",
  ({ strapi }) => ({
    // async importFromCsv(ctx) {
    //   const { file } = ctx.request.files;
    //   if (!file) {
    //     return ctx.badRequest("No file uploaded");
    //   }

    //   const buffer = fs.readFileSync(file.path);
    //   const records = parse(buffer, {
    //     columns: true,
    //     skip_empty_lines: true,
    //   });

    //   // Process records...
    // },

    async importFromCsv(ctx) {
      try {
        // 1) Read CSV either from uploaded file (multipart) or from a file path query (?path=/absolute/file.csv)
        let csvBuffer;

        if (ctx.request.files?.file) {
          let test: any = ctx.request.files?.file;
          console.log("Reading CSV file...", test);
          const file: any = test?._writeStream?.path; // field name "file"
          console.log("FIEL", file);
          csvBuffer = fs.readFileSync(file);
        } else if (ctx.query?.path) {
          const csvPath = path.resolve(ctx.query.path);
          if (!fs.existsSync(csvPath)) {
            return ctx.badRequest(`CSV file not found at: ${csvPath}`);
          }
          csvBuffer = fs.readFileSync(csvPath);
        } else {
          return ctx.badRequest(
            "Provide a CSV file (multipart field 'file') or a file path via ?path=/abs/path.csv"
          );
        }

        // 2) Parse CSV
        const records = parse(csvBuffer, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });

        if (!records.length) {
          return ctx.badRequest("CSV parsed, but no rows found.");
        }

        // 3) Fetch all users (users-permissions)
        const users = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            fields: ["id", "username", "email"],
            limit: -1,
          }
        );
        if (!users?.length) {
          return ctx.badRequest("No users found in Users & Permissions.");
        }

        // 4) Process each row
        const results = [];
        for (const [idx, row] of records.entries()) {
          const rowNo = idx + 1;

          // Map CSV -> fields (adjust these keys to your header names)
          const title = row.title || row.Title;
          const link = row.link || row.Link || row.url;
          const description = row.description || row.Description || row.desc;
          const address = row.address || row.Address || row.location;
          const categoryName = row.category || row.Category || row.categories;

          if (!title || !link || !description || !address || !categoryName) {
            results.push({
              row: rowNo,
              status: "skipped",
              reason:
                "Missing required column(s): title/link/description/address/category",
            });
            continue;
          }

          // 4a) Category lookup (containsi)
          const catMatches = await strapi.entityService.findMany(
            "api::category.category",
            {
              fields: ["id", "name"],
              filters: { name: { $containsi: String(categoryName).trim() } },
              limit: 1,
            }
          );

          if (!catMatches?.[0]?.id) {
            results.push({
              row: rowNo,
              status: "skipped",
              reason: `No matching category for "${categoryName}"`,
            });
            continue;
          }
          const categoryId = catMatches[0].id;

          // 4b) Random user
          const randomUser = users[Math.floor(Math.random() * users.length)];
          const postedById = randomUser.id;

          // 4c) Image(s) upload
          // const imageUrls = splitMulti(
          //   row.media_url || row.image_urls || row.image || row.images
          // );
          let url = row.media_url;
          console.log("IMAGE URL:", url);
          const mediaIds = [];
          // for (const url of imageUrls) {
          try {
            console.log("--- RUNNING THE LATEST CODE: VERSION BLUE --");
            const { buffer, contentType } = await downloadToBuffer(url);
            if (!buffer || !Buffer.isBuffer(buffer)) {
              throw new Error(`Failed to download image from ${url}`);
            }

            const filename = path.basename(
              new URL(url).pathname || `image-${Date.now()}`
            );
            console.log("BEFORE UPLOAD", filename, buffer, contentType);
            const ids = await uploadViaHttpLegacy(
              filename,
              buffer,
              contentType
            );
            mediaIds.push(...ids);
          } catch (err) {
            // Log and continue without this image
            strapi.log.warn(
              `[IMPORT] Row ${rowNo}: failed to fetch/upload image ${url} -> ${err.message}`
            );
          }
          // }

          // 4d) Create post
          try {
            const created = await strapi.entityService.create(
              "api::post.post",
              {
                data: {
                  post_type: "post",
                  title,
                  description,
                  link,
                  posted_by: postedById, // relation
                  location: { address }, // adjust if your component key differs
                  category: categoryId, // relation
                  media: mediaIds?.length ? mediaIds : [], // media field (multiple)
                },
                populate: ["category", "posted_by", "media"],
              }
            );

            results.push({
              row: rowNo,
              status: "created",
              id: created.id,
              title,
            });
          } catch (err) {
            strapi.log.error(
              `[IMPORT] Row ${rowNo}: create failed -> ${err.message}`
            );
            results.push({ row: rowNo, status: "failed", reason: err.message });
          }
        }

        ctx.body = {
          ok: true,
          totalRows: records.length,
          summary: {
            created: results.filter((r) => r.status === "created").length,
            skipped: results.filter((r) => r.status === "skipped").length,
            failed: results.filter((r) => r.status === "failed").length,
          },
          details: results,
        };
      } catch (e) {
        strapi.log.error(`[IMPORT] Fatal error: ${e.stack || e.message}`);
        ctx.internalServerError(e.message);
      }
    },

    async updateMentionPolicy(ctx) {
      const userId = ctx.state.user.id;

      let mentionPolicyBody = ctx.request.body;
      let findMentionPolicy = await strapi
        .service("api::mention-policy.mention-policy")
        .findOrCreateMentionPolicy(userId);

      let mentionId = findMentionPolicy.id;
      console.log("Mention ID:", mentionId, mentionPolicyBody);

      const updateMentionPolicy = await strapi.entityService.update(
        "api::mention-policy.mention-policy",
        mentionId,
        {
          data: {
            ...mentionPolicyBody,
          },
        }
      );
      return ctx.send({
        message: "Updated mention policy successfully!",
      });
    },
    async getMentionPolicy(ctx) {
      const userId = ctx.state.user.id;

      let findMentionPolicy = await strapi
        .service("api::mention-policy.mention-policy")
        .findOrCreateMentionPolicy(userId);

      return ctx.send({
        mention_policy: findMentionPolicy,
      });
    },
  })
);
