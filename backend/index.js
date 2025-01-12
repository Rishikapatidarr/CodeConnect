import express from "express"
import dotenv from "dotenv"
import User from "./models/user.models.js"
import connectDB from "./db/index.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import upload from "./middlewares/fileuploader.middleware.js"
import {v2 as cloudinary} from "cloudinary"
import fs from "fs"
import { Video } from "./models/video.model.js"
import fileretreve from "./middlewares/fileretreve.js"
import cors from 'cors'
import cookieParser from "cookie-parser"
import { verifyJwt } from "./middlewares/verifyjwt.js"
import logOutUser from "./controllers/user.controllers.js"
import router from "./middlewares/fileretreve.js"
import getUserChannelProfile from "./controllers/followers.contollers.js"
import unfollowUser from "./controllers/followersdecrese.js"
import followUser from "./controllers/followersincrese.js"

// load the .env file 
dotenv.config({ path: './.env' })

// express to handle the route and listening

const app = express()

// to allow cross-origin access

app.use(cors({
    origin: 'http://localhost:5173', // Your frontend URL
    credentials: true, // Allow cookies
  }));
// to process the json data(middle-ware)

app.use(express.json()) 

// to use the cookies

app.use(cookieParser())

// function which is imported to run the DB connction

connectDB()

cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET 
});
// to handle the User registeration
app.post("/api/signup", upload.single("avatar"), async (req, res) => {
    console.log(req.body);
    const { fullName, userName, email, password, profession, about } = req.body;

    if (!password) {
        return res.status(400).send("Password is required");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const avatarLocalPath = req.file.path; // Corrected to req.file
    try {
        const response = await cloudinary.uploader.upload(avatarLocalPath, {
            resource_type: "auto"
        });

        // Clean up local file after upload
        if (fs.existsSync(avatarLocalPath)) {
            fs.unlinkSync(avatarLocalPath);
        }

        const uploaded_file_link = response.secure_url;
        const newUser = new User({
            fullName,
            userName,
            email,
            password: hashedPassword,
            profession,
            about,
            avatar:uploaded_file_link
        });

        await newUser.save();
        console.log(newUser); // Logging before return to ensure execution
        return res.json({ message: "Sign-Up Successfully!" });

    } catch (error) {
        return res.status(500).json({ Error: error.message });
    }
});


// to handle the User login

app.post("/api/login", async(req,res)=>{
    const {userName,password}  = req.body

    try{
        const userFound=await User.findOne({ userName })

        if(!userFound){
            return res.status(400).send("Envalid User ID or Password")
        }

        const isPasswordValid = await bcrypt.compare(password,  userFound.password)

        if(!isPasswordValid){
            return res.status(400).send("Invalid User ID or Password")
        }

        const token = jwt.sign({ _id: userFound._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" })
        userFound.accessToken = token
        await userFound.save({ validateBeforeSave: false })
        const options={
            httpOnly:true,
            secure:true
        }

        return res.status(200).cookie("accessToken",token,options).json({message:"login sucessfull"})
        
       
    }
    catch(error){
        console.log(error);
        return res.status(400).send("Error while logging in")
    }
})

// cloudinary configuration for file uploaing on clouds



// file uploading function with middledware of multer names as upload
  
app.post("/api/upload",verifyJwt, upload.single("file"), async (req, res) => {
    const localFilePath = req.file.path
    const { file_description } = req.body

    try {
        const user = req.user; 
        if (!user) {
            return res.status(400).send("User not found");
        }
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        });

        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath) 
        }

        const uploaded_file_link = response.secure_url
        const final_data = new Video({
            user:user._id, 
            uploaded_file_link,
            file_description
        });

        await final_data.save()
        
        console.log(final_data)

        return res.json({ url: uploaded_file_link })
    } catch (error) {
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath)
        }

        console.log(error)
        return res.status(500).send("File upload failed")
    }
})

// File retreve function calling on a specific route

app.get('/api/files',verifyJwt, router)

// logout function calling on a specific route with middle-ware

app.post('/api/logout', verifyJwt, logOutUser)

app.get('/api/userprofile',verifyJwt,getUserChannelProfile)

app.post('/api/follow',verifyJwt,followUser)

app.post('/api/unfollow',verifyJwt,unfollowUser)

// retreve all the files of a perticular user

app.post('/api/collections',verifyJwt,async(req,res)=>{
    try {
        const findUser=req.user._id

        const found=await User.findById(findUser)

        if(!found){
            res.status(404).send("User not found")
        }
        const files = await Video.find({user:findUser})
        
       
        const fileResponses = []
        files.forEach(file => {
            fileResponses.push({
                id: file.user,
                url: file.uploaded_file_link,
            })
        })
        const finalData = []
        for (const fileResponse of fileResponses) {
            const userData = await User.findById(fileResponse.id)
            finalData.push({
                userName: userData ? userData.userName : 'Unknown User',
                url: fileResponse.url
            })
        }

        res.json({ success: true, files: finalData })
    } 
    catch (error) {
        console.error("Error fetching files:", error)
        res.status(500).json({ success: false, message: error.message })
    }
})
// listener on specific port on which the server is running

app.listen(process.env.PORT, () => {
    console.log("Server started on port", process.env.PORT)
})