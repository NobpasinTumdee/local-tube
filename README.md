# LocalTube 📺

[English](#english) | [ภาษาไทย](#ภาษาไทย)

---

<a name="english"></a>
## 🇬🇧 English Version

### What is LocalTube?
LocalTube is a modern, web-based application designed to act as a "Local YouTube Clone". It allows users to browse and watch their local video collections directly in the browser with a beautiful, YouTube-like dark mode interface. 

**Key Constraint & Privacy:** There is **NO backend**, **NO database**, and **NO login system**. The application runs entirely locally in your browser using the modern **File System Access API**. Your files never leave your computer.

### Key Features
- **Local Directory Scanning:** Select a folder, and it recursively finds all compatible video files (`.mp4`, `.webm`, `.ogg`, etc.). Top-level folders act as "Home", and subfolders act as "Playlists" (or Channels).
- **Auto Thumbnail Extraction:** Extracts frames directly from local video files to use as thumbnails, implementing lazy loading via `IntersectionObserver` and a concurrency queue to ensure performance even with hundreds of videos.
- **Custom Video Player:** A fully-featured custom player over the native HTML5 video element. Supports play/pause, seeking, volume control, theater mode, fullscreen, and native Picture-in-Picture.
- **Seamless Mini-Player:** Press the `i` key to transition smoothly between a full-screen player and a floating mini-player at the bottom corner. The video element is persistent, meaning playback doesn't restart during transitions.
- **Vertical Video Support:** The player container adapts to vertical videos using `object-fit: contain` within a fixed viewport height.

### Detailed Tech Stack
- **Framework:** React 18
- **Build Tool:** Vite (Fast cold starts, hot module replacement)
- **Language:** TypeScript (Strict typing for robust code)
- **Styling:** Tailwind CSS (Utility-first CSS framework for rapid UI development) & Pure CSS modules for specific scrollbar/range inputs.
- **State Management:** Zustand (Lightweight, un-opinionated state management)
- **Animations:** Framer Motion (Used for smooth layout transitions between the full player and mini-player)
- **Browser APIs:** 
  - `File System Access API` (`showDirectoryPicker`) for reading local folders.
  - `IntersectionObserver` for lazy loading thumbnails.
  - `<canvas>` API for capturing video frames.

### Project Structure (File Explanations)

#### Core Files
- `index.html`: The main HTML entry point.
- `package.json`: Project dependencies and scripts.
- `tailwind.config.js`: Configuration for Tailwind CSS styles.
- `vite.config.ts`: Configuration for the Vite bundler.
- `tsconfig.json`: TypeScript compiler configurations.

#### Source Code (`src/`)
- `main.tsx`: The React entry point that mounts the `App` component to the DOM.
- `App.tsx`: The main application wrapper. Manages view state (home vs. playing) and global keyboard shortcuts (e.g., toggling the mini-player).
- `index.css`: Global CSS, including custom scrollbar and range slider styling.

#### State Management (`src/store/`)
- `useStore.ts`: The central Zustand store. Manages the global state including the video library (files, playlists), navigation state (search query, sidebar visibility), and player state (current video, full/mini mode, theater mode, and cached metadata like thumbnails).

#### Components (`src/components/`)
- `Welcome.tsx`: The initial landing screen prompting the user to select a local folder.
- `Header.tsx`: The top navigation bar containing the hamburger menu, logo (which navigates home), search bar, and "Change Folder" button.
- `Sidebar.tsx`: The collapsible side menu displaying the "Home" option and dynamic playlists based on subfolders.
- `VideoGrid.tsx`: A responsive grid container that maps over video entries to display cards.
- `VideoCard.tsx`: Represents a single video. It handles lazy loading its own thumbnail using `IntersectionObserver` to trigger the extraction utility only when visible.
- `Player.tsx`: The complex custom video player component. It uses `framer-motion` to smoothly animate between a large overlay and a floating mini-player without unmounting the `<video>` tag, ensuring seamless playback. Includes custom controls and an "Up Next" queue.

#### Utilities (`src/utils/`)
- `directoryScanner.ts`: Uses the File System Access API to recursively read directories, filter video files, and map them into a structured format for the application.
- `generateThumbnail.ts`: Creates a hidden `<video>` element, loads a file blob, seeks to 1.0 second, draws the frame to a `<canvas>`, and exports it as a base64 image. Includes a `ThumbnailQueue` to prevent browser freezing.
- `format.ts`: Helper functions to format durations (e.g., `12:34`), file sizes (e.g., `1.2 GB`), and relative dates (e.g., `2 days ago`).

---

<a name="ภาษาไทย"></a>
## 🇹🇭 Thai Version (ภาษาไทย)

### LocalTube คืออะไร?
LocalTube คือเว็บแอปพลิเคชันสมัยใหม่ที่ออกแบบมาให้เป็น "YouTube สำหรับไฟล์ในเครื่อง (Local YouTube Clone)" แอปนี้ช่วยให้คุณสามารถเปิดดูคลังวิดีโอในเครื่องคอมพิวเตอร์ของคุณผ่านเบราว์เซอร์ได้โดยตรง มาพร้อมกับหน้าต่างการใช้งานแบบ Dark Mode ที่สวยงามเหมือน YouTube

**ข้อจำกัดหลักและความเป็นส่วนตัว:** โปรเจคนี้ **ไม่มี Backend**, **ไม่มี Database**, และ **ไม่มีระบบ Login** ทุกอย่างทำงานแบบออฟไลน์บนเบราว์เซอร์ของคุณ 100% โดยใช้ **File System Access API** ไฟล์วิดีโอของคุณจะไม่ถูกอัปโหลดไปที่ไหนทั้งสิ้น

### ฟีเจอร์หลัก
- **สแกนโฟลเดอร์ในเครื่อง:** เลือกโฟลเดอร์หลัก แล้วระบบจะค้นหาไฟล์วิดีโอทั้งหมดที่รองรับ (`.mp4`, `.webm`, `.ogg`) แบบเจาะลึก (Recursive) โฟลเดอร์หลักจะเปรียบเสมือนหน้า "Home" ส่วนโฟลเดอร์ย่อยจะถูกแปลงเป็น "Playlists" (หรือ Channels)
- **สร้างภาพตัวอย่าง (Thumbnail) อัตโนมัติ:** ระบบจะดึงเฟรมภาพจากไฟล์วิดีโอมาทำเป็นหน้าปกโดยอัตโนมัติ มีระบบ Lazy Loading โดยใช้ `IntersectionObserver` และระบบจัดการคิว (Concurrency Queue) เพื่อไม่ให้เบราว์เซอร์ค้างแม้จะมีวิดีโอเป็นร้อยไฟล์
- **Video Player แบบ Custom:** เครื่องเล่นวิดีโอที่สร้าง UI ครอบทับ HTML5 Video แบบปกติ รองรับการ เล่น/หยุด, เลื่อนเวลา, ปรับเสียง, Theater Mode, Fullscreen, และ Picture-in-Picture ของเบราว์เซอร์
- **Mini-Player แบบไร้รอยต่อ:** กดปุ่ม `i` บนคีย์บอร์ดเพื่อย่อวิดีโอจากโหมดเต็มจอเป็น Mini-player ขนาดเล็กมุมล่างขวา ระบบสามารถสลับโหมดไปมาได้อย่างนุ่มนวลโดยวิดีโอไม่หยุดเล่นหรือโหลดใหม่
- **รองรับวิดีโอแนวตั้ง:** หน้าต่างเล่นวิดีโอรองรับวิดีโอแนวตั้งโดยอัตโนมัติ โดยใช้ `object-fit: contain` เพื่อให้อยู่ในกรอบโดยไม่ล้นหน้าจอ

### เทคโนโลยีที่ใช้ (Tech Stack แบบละเอียด)
- **Framework:** React 18
- **Build Tool:** Vite (เริ่มโปรเจคไว, อัปเดตการเปลี่ยนแปลงแบบ Hot Module Replacement เร็วมาก)
- **Language:** TypeScript (เพิ่มความปลอดภัยในการเขียนโค้ดด้วยการกำหนด Type แบบเข้มงวด)
- **Styling:** Tailwind CSS (Utility-first CSS สำหรับการสร้าง UI อย่างรวดเร็ว) ผสมกับ Pure CSS สำหรับการตกแต่ง Scrollbar และ Range input
- **State Management:** Zustand (จัดการ State ระดับ Global ได้เบาและใช้งานง่ายกว่า Redux)
- **Animations:** Framer Motion (ใช้สำหรับทำแอนิเมชัน Layout ให้สลับระหว่างโหมดจอใหญ่กับ Mini-player ได้อย่างสมูท)
- **Browser APIs:** 
  - `File System Access API` (`showDirectoryPicker`) สำหรับขอสิทธิ์อ่านโฟลเดอร์ในเครื่องผู้ใช้
  - `IntersectionObserver` สำหรับโหลด Thumbnail เฉพาะตอนที่ผู้ใช้เลื่อนหน้าจอมาเห็น
  - `<canvas>` API สำหรับแคปเจอร์ภาพเฟรมจากวิดีโอ

### โครงสร้างโปรเจค (หน้าที่ของแต่ละไฟล์)

#### ไฟล์หลักของระบบ
- `index.html`: ไฟล์ HTML หลักที่เบราว์เซอร์เรียกใช้
- `package.json`: จัดการ Dependencies และ Scripts ต่างๆ ของโปรเจค
- `tailwind.config.js`: ตั้งค่าสีหรือ Theme ต่างๆ สำหรับ Tailwind CSS
- `vite.config.ts`: ตั้งค่า Vite bundler
- `tsconfig.json`: ตั้งค่าการทำงานของ TypeScript

#### ซอร์สโค้ด (`src/`)
- `main.tsx`: จุดเริ่มต้นของ React นำ Component `App` ไปผูกกับ DOM
- `App.tsx`: ตัวครอบแอปพลิเคชันทั้งหมด จัดการว่าควรจะแสดงหน้า Home หรือเล่นวิดีโอ และดักจับคีย์บอร์ด (เช่น กด 'i' เพื่อเปิด Mini-player)
- `index.css`: CSS หลักของโปรเจค รวมถึงการปรับแต่ง Scrollbar และ Slider ของวิดีโอ

#### การจัดการ State (`src/store/`)
- `useStore.ts`: ไฟล์ Zustand Store ส่วนกลาง เก็บข้อมูลทั้งหมด เช่น รายการวิดีโอ (Videos, Playlists), สถานะหน้าจอ (คำค้นหา, การเปิดปิด Sidebar), และสถานะของ Player (วิดีโอที่เล่นอยู่, โหมดหน้าจอ, ข้อมูลภาพปก)

#### คอมโพเนนต์ (`src/components/`)
- `Welcome.tsx`: หน้าจอแรกสุดที่เชิญชวนให้ผู้ใช้กดปุ่มเลือกโฟลเดอร์วิดีโอ
- `Header.tsx`: แถบด้านบนสุด มีปุ่มเมนู (Hamburger), โลโก้ (กดเพื่อกลับหน้าแรก), ช่องค้นหาวิดีโอ, และปุ่มเปลี่ยนโฟลเดอร์
- `Sidebar.tsx`: เมนูด้านข้าง สามารถพับเก็บได้ แสดงปุ่ม "Home" และรายชื่อ Playlists ที่สร้างจากโฟลเดอร์ย่อย
- `VideoGrid.tsx`: กรอบแสดงผลวิดีโอแบบ Grid ที่ปรับขนาดตามหน้าจอ
- `VideoCard.tsx`: การ์ดวิดีโอ 1 อัน จัดการเรื่องการดึงภาพปกของตัวเองขึ้นมาแสดงแบบ Lazy Load (ดึงภาพเฉพาะตอนที่เลื่อนมาเจอ)
- `Player.tsx`: คอมโพเนนต์เครื่องเล่นวิดีโอที่ซับซ้อนที่สุด ใช้ `framer-motion` เพื่อทำแอนิเมชันตอนย่อ/ขยายจอ (Mini-player) โดยไม่ให้ `<video>` หลุดออกจาก DOM เพื่อให้วิดีโอเล่นต่อเนื่องไม่สะดุด มีปุ่มควบคุมครบครัน และมีแถบ "Up Next" สำหรับวิดีโอถัดไป

#### ฟังก์ชันช่วยเหลือ (`src/utils/`)
- `directoryScanner.ts`: ใช้ File System Access API อ่านโฟลเดอร์ คัดกรองเฉพาะไฟล์วิดีโอ และจัดกลุ่มให้อยู่ในรูปแบบที่แอปพลิเคชันต้องการ
- `generateThumbnail.ts`: ฟังก์ชันสร้าง `<video>` แบบซ่อนไว้ โหลดไฟล์ลงไป เลื่อนไปที่วินาทีที่ 1.0 แล้ววาดภาพลงบน `<canvas>` เพื่อแปลงเป็นรูปภาพ base64 มีระบบคิวเพื่อไม่ให้ทำงานหนักเกินไปจนเครื่องค้าง
- `format.ts`: ฟังก์ชันสำหรับจัดรูปแบบตัวเลข เช่น รูปแบบเวลา (`12:34`), ขนาดไฟล์ (`1.2 GB`), และเวลาที่ผ่านมา (`2 days ago`)
