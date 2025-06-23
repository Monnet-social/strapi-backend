import { Storage } from "@google-cloud/storage";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import axios from "axios";
import sharp from "sharp";

// AWS.config.update({
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     region: process.env.AWS_REGION,
// });
const storage = new Storage({
  projectId: "monnet-social",
  keyFilename: "service-account.json",
});

export default class FileOptimisationService {
  // s3: AWS.S3;
  // constructor() {
  //     this.s3 = new AWS.S3();
  // }

  getFileType(
    mime: string
  ): "image" | "video" | "audio" | "document" | "other" {
    if (mime.startsWith("image")) {
      return "image";
    } else if (mime.startsWith("video")) {
      return "video";
    } else if (mime.startsWith("audio")) {
      return "audio";
    } else if (mime.startsWith("application/pdf")) {
      return "document";
    } else {
      return "other";
    }
  }

  async handleOptimisation(file_data: any): Promise<any> {
    const { mime, url } = file_data;
    const file_type = this.getFileType(mime);
    let data = {
      thumbnail_url: "",
      compressed_url: "",
      reels_optimised_url: "",
    };

    switch (file_type) {
      case "image":
        data.thumbnail_url = await this.generateThumbnailFromImage(url);
        data.compressed_url = await this.compressImage(url);
        break;
      case "video":
        data.thumbnail_url = await this.generateThumbnailFromVideo(url);
        data.compressed_url = await this.compressVideo(url);
        break;
    }

    return data;
  }

  async downloadFile(
    media_url: string,
    file_path: string = ""
  ): Promise<string> {
    const media_id = Math.floor(Math.random() * 1000000000);
    const file_name = file_path || `/tmp/media-${media_id}`;
    try {
      const file_content = fs.createWriteStream(file_name);

      const response = await axios({
        url: media_url,
        method: "GET",
        responseType: "stream",
      });

      response.data.pipe(file_content);

      await new Promise((resolve: any, reject) => {
        file_content.on("finish", resolve);
        file_content.on("error", reject);
      });
      console.log("Downloaded file:", file_name);

      return file_name;
    } catch (error) {
      console.error("Error downloading file:", error);
      throw new Error("Failed to download file");
    }
  }

  // async uploadFileToS3(file_path: string, mime: string): Promise<string> {
  //     const file_content = fs.readFileSync(file_path);
  //     const file_id = Math.floor(Math.random() * 1000000000);
  //     const file_key = `media/media-${file_id}`;

  //     try {
  //         const { Location: file_url } = await this.s3
  //             .upload({
  //                 Bucket: process.env.AWS_BUCKET,
  //                 Key: file_key,
  //                 Body: file_content,
  //                 ContentType: mime,
  //                 ACL: 'public-read',
  //             })
  //             .promise();
  //         console.log('Uploaded file to S3:', file_url);

  //         return file_url;
  //     } catch (error) {
  //         console.error('Error uploading file:', error);
  //         throw new Error('Failed to upload file');
  //     }
  // }

  async uploadFileToCloudStorage(
    file_path: string,
    mime: string
  ): Promise<string> {
    try {
      // const file_content = fs.readFileSync(file_path);
      const file_id = Math.floor(Math.random() * 1000000000);
      const file_key = `media/media-${file_id}`;
      const gcs = storage.bucket("gs://" + process.env.GCP_STORAGE_BUCKET);
      const result = await gcs.upload(file_path, {
        destination: file_key,
        public: true,
        metadata: {
          contentType: mime, //application/csv for excel or csv file upload
        },
      });
      console.log("Uploaded file to Cloud Storage:", result);
      return result[0].metadata.mediaLink;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw new Error("Failed to upload file");
    }

    // try {
    //     const { Location: file_url } = await this.s3
    //         .upload({
    //             Bucket: process.env.GCP_STORAGE_BUCKET,
    //             Key: file_key,
    //             Body: file_content,
    //             ContentType: mime,
    //             ACL: 'public-read',
    //         })
    //         .promise();
    //     console.log('Uploaded file to S3:', file_url);

    //     return file_url;
    // } catch (error) {
    //     console.error('Error uploading file:', error);
    //     throw new Error('Failed to upload file');
    // }
  }

  async generateThumbnailFromImage(media_url: string): Promise<string> {
    console.log("Generating thumbnail from image:", media_url);
    const media_id = Math.floor(Math.random() * 1000000000);
    try {
      const file_path = await this.downloadFile(media_url);
      const thumbnail_path = `/tmp/thumbnail-${media_id}.png`;

      await sharp(file_path).resize(200, 200).toFile(thumbnail_path);

      const uploaded_thumbnail_url = await this.uploadFileToCloudStorage(
        thumbnail_path,
        "image/png"
      );
      return uploaded_thumbnail_url;
    } catch (error) {
      console.error("Error uploading thumbnail:", error);
      throw new Error("Failed to upload thumbnail");
    }
  }

  async generateThumbnailFromVideo(media_url: string): Promise<string> {
    const media_id = Math.floor(Math.random() * 1000000000);
    const thumbnail_path = `/tmp/thumbnail-${media_id}.png`;

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(media_url)
          .outputOptions([
            "-vf",
            "scale=300:-1",
            "-vframes",
            "1",
            "-ss",
            "00:00:01.000",
          ])
          .output(thumbnail_path)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      const thumbnail_url = await this.uploadFileToCloudStorage(
        thumbnail_path,
        "image/png"
      );
      return thumbnail_url;
    } catch (error) {
      console.error("Error generating or uploading thumbnail:", error);
      throw new Error("Failed to generate or upload thumbnail");
    }
  }

  async compressImage(media_url: string): Promise<string> {
    console.log("Compressing image:", media_url);
    const media_id = Math.floor(Math.random() * 1000000000);

    try {
      const file_path = await this.downloadFile(media_url);
      const compressed_path = `/tmp/compressed-${media_id}.png`;
      // Create file if not exists
      fs.closeSync(fs.openSync(compressed_path, "w"));

      sharp(file_path)
        .webp({ lossless: true, quality: 80, alphaQuality: 80 })
        .toFile(compressed_path);

      const compressed_url = await this.uploadFileToCloudStorage(
        compressed_path,
        "image/png"
      );
      return compressed_url;
    } catch (error) {
      console.error("Error compressing image:", error);
      throw new Error("Failed to compress image");
    }
  }

  async compressVideo(media_url: string): Promise<string> {
    const media_id = Math.floor(Math.random() * 1000000000);

    try {
      const compressed_path = `/tmp/compressed-${media_id}.mp4`;

      await new Promise((resolve, reject) => {
        ffmpeg(media_url)
          .videoCodec("libx264")
          .audioCodec("aac")
          .outputOptions(["-crf 28", "-preset veryfast"])
          .on("end", resolve)
          .on("error", reject)
          .save(compressed_path);
      });

      const compressed_url = await this.uploadFileToCloudStorage(
        compressed_path,
        "video/mp4"
      );
      return compressed_url;
    } catch (error) {
      console.error("Error compressing video:", error);
      throw new Error("Failed to compress video");
    }
  }

  async getVideoDuration(media_url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(media_url, (err, metadata) => {
        if (err) {
          console.error("Error getting video duration:", err);
          reject(err);
        } else {
          const duration = metadata.format.duration;
          resolve(duration);
        }
      });
    });
  }
}
