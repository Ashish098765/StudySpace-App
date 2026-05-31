const cloudinary = require('cloudinary').v2;

// 1. Configure Cloudinary using your specific credentials
cloudinary.config({
  cloud_name: 'dyxyzz9r9',
  api_key: '749275122266684',
  api_secret: 'Av4lf54iD_MNQeD_7jlxrPzr4iw'
});

async function runCloudinaryTest() {
  try {
    // 2. Upload a sample image from Cloudinary's demo servers
    console.log("Uploading image...");
    const uploadResult = await cloudinary.uploader.upload(
      "https://res.cloudinary.com/demo/image/upload/sample.jpg", 
      { public_id: "my_first_test_upload" }
    );
    
    console.log("✅ Upload successful!");
    console.log("Secure URL:", uploadResult.secure_url);
    console.log("Public ID:", uploadResult.public_id);

    // 3. Get and print image details (metadata)
    console.log("\n📊 Image Details:");
    console.log("Width:", uploadResult.width, "px");
    console.log("Height:", uploadResult.height, "px");
    console.log("Format:", uploadResult.format);
    console.log("Size (bytes):", uploadResult.bytes);

    // 4. Transform the image
    // f_auto: Automatically delivers the image in the most efficient format for the user's browser (like WebP or AVIF)
    // q_auto: Automatically compresses the image to save bandwidth without reducing visible quality
    const transformUrl = cloudinary.url("my_first_test_upload", {
      fetch_format: 'auto',
      quality: 'auto'
    });

    console.log("\n✨ Done! Click link below to see optimized version of the image. Check the size and the format.");
    console.log(transformUrl);

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

runCloudinaryTest();