const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const LocalStorage = require('node-localstorage').LocalStorage;
const axios = require('axios');
const localStorage = new LocalStorage('./scratch');

const titlesTempPath = path.resolve(__dirname, '../../private/temp/titles.tmp');
const picTempPath = path.resolve(__dirname, '../../private/temp/pic.tmp');
const magnetLinksTempPath = path.resolve(__dirname, '../../private/temp/magnet_links.tmp');
const descTempPath = path.resolve(__dirname, '../../private/temp/descs.json');
var exec = require('child_process').execFile;

// Function to spawn the C++ child process
function runCppProcess() {
    const cppExecutable = './app/display_image.exe'; 


    const childProcess = exec(cppExecutable, function(err, data){
      console.log(err)
      console.log(data.toString)
    });
    console.log("ran it")
    // Return the child process object
    return childProcess;
}


const cppProcess = runCppProcess();

// To close the C++ process when needed:
function closeCppProcess() {
    if (cppProcess && !cppProcess.killed) {
        cppProcess.kill(); // Send the SIGTERM signal to terminate the process
        console.log('C++ process terminated.');
    }
}

const isFileNotEmpty = (TempPaths) => {
  try {
    for (const TempPath of TempPaths) {
      const stats = fs.statSync(TempPath);
      if (stats.size === 0) {
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("Error:", error);
    return false;
  }
};

function deleteLinesWithWord(filePath, targetWord) {

  const fileContents = fs.readFileSync(filePath, 'utf-8');

  const lines = fileContents.split('\n');

  // Filter out lines containing the target word
  const filteredLines = lines.filter(line => !line.includes(targetWord));

  const updatedContents = filteredLines.join('\n');

  fs.writeFileSync(filePath, updatedContents, 'utf-8');

}
const shouldRunFunction = () => {
  const storedTimestamp = localStorage.getItem('lastExecutionTimestamp');

  if (!storedTimestamp || Date.now() - parseInt(storedTimestamp, 10) >= 1 * 60 * 60 * 1000) {
    console.log("Function can run.");
    localStorage.setItem('lastExecutionTimestamp', Date.now().toString());
    return true;
  }

  console.log("Function can't run yet.");
  return false;
};

const getMagnetLinks = async (page) => {
  return await page.evaluate(() => {
    const anchorTags = document.querySelectorAll("a");
    let magnetLinks = [];

    anchorTags.forEach((anchorTag) => {
      const hrefAttr = anchorTag.getAttribute("href");
      if (hrefAttr && hrefAttr.includes("magnet")) {
        magnetLinks.push(hrefAttr);
      }
    });

    return magnetLinks;
  });
};

const getGamesTitles = async (page) => {
  return await page.evaluate(() => {
    const gamesTitles = document.querySelectorAll(".entry-title");
    const gamesPictures = document.querySelectorAll(".alignleft");
    let titles = [];
    let srcPics = [];

    gamesTitles.forEach((titleElement) => {
      const anchorTag = titleElement.querySelector("a");
      if (anchorTag) {
        titles.push(anchorTag.innerText);
      }
    });

    gamesPictures.forEach((pictureElement) => {
      const srcAttr = pictureElement.getAttribute("src");
      if (srcAttr) {
        srcPics.push(srcAttr);
      }
    });

    titles = titles.map(item => item === 'ΓÇô' ? '-' : item);

    return { titles, srcPics };
  });
};

const getGamesDesc = async (page) => {
  return await page.evaluate(() => {
    const gamesInfoElements = document.querySelectorAll("div.entry-content");
    let gamesInfo = [];

    gamesInfoElements.forEach((infoElement) => {
      const gameInfo = {};

      const findText = (element, searchText) => {
        const foundElement = Array.from(element.childNodes).find(node => node.textContent.includes(searchText));
        return foundElement ? foundElement.textContent.trim() : '';
      };

      gameInfo.info = findText(infoElement, 'Genres/Tags:') + '\n';

      gamesInfo.push(gameInfo);
    });

    return gamesInfo;
  });
};


const getGamesData = async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (['image', 'stylesheet', 'font', 'script'].indexOf(request.resourceType()) !== -1) {
      request.abort();
    } else {
      request.continue();
    }
  });

  const ftgGamesData = {
    titles: [],
    srcPics: [],
    magnetLinks: [],
    descs: []
  };

  for (let i = 1; i <= 5; i++) {
    const url = `https://fitgirl-repacks.site/category/lossless-repack/page/${i}/`;

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.alignleft', { visible: true });

    const ftgGamesDataPage = await getGamesTitles(page);
    const magnetLinksPage = await getMagnetLinks(page);
    const ftgGamesDescPage = await getGamesDesc(page);

    ftgGamesData.titles.push(...ftgGamesDataPage.titles);
    ftgGamesData.srcPics.push(...ftgGamesDataPage.srcPics);
    ftgGamesData.magnetLinks.push(...magnetLinksPage);
    ftgGamesData.descs.push(...ftgGamesDescPage);
  }

  await browser.close();
  return ftgGamesData;
};


const writingData = async () => {
  const ftgGamesData = await getGamesData();
  const ftgDescs = ftgGamesData.descs.map(gameInfo => gameInfo.info);
  fs.writeFile(titlesTempPath, ftgGamesData.titles.join('\n'), function (err) {
    if (err) throw err;
    console.log("Saved Titles");
  });

  fs.writeFile(picTempPath, ftgGamesData.srcPics.join('\n'), function (err) {
    if (err) throw err;
    console.log("Saved Pictures");
  });

  fs.writeFile(magnetLinksTempPath, ftgGamesData.magnetLinks.join('\n'), function (err) {
    const filePath = magnetLinksTempPath;
    const targetWord = 'rutor';

    deleteLinesWithWord(filePath, targetWord);
    if (err) throw err;
    console.log("Saved Magnet Links");
  });
  fs.writeFile(descTempPath, JSON.stringify(ftgGamesData.descs, null, 2), function (err) {
    if (err) throw err;
    console.log("Saved Descriptions");
  });

};
async function downloadSitemap(url, filename) {
  try {

      const response = await axios.get(url, { responseType: 'stream' });
      
      const filePath = path.join(__dirname, '../html/sitemaps/', filename); 
      
      // Create any necessary directories
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      
      // Create a writable stream to save the sitemap content
      const writer = fs.createWriteStream(filePath);
      
      // Pipe the response stream into the writer stream
      response.data.pipe(writer);
      
      // Return a promise to handle completion
      return new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
      });
  } catch (error) {
      console.error(`Error downloading ${filename}:`, error);
  }
}

function iterationSitemap(){
  // Limited to 5 (the actual number of sitemap) because Fitgirl's website does not return an error but a document saying error soooo too complicated.
for (let i = 0; i < 5; i++) {
  const sitemapNumber = (i === 0) ? "" : i + 1;
  const url = `https://fitgirl-repacks.site/post-sitemap${sitemapNumber ? + sitemapNumber : ''}.xml`;
  const filename = `post-sitemap${sitemapNumber ? + sitemapNumber : ''}.xml`;

  // Call the function to download each sitemap
  downloadSitemap(url, filename).then(() => {
      console.log(`${filename} downloaded successfully.`);
  }).catch(err => {
      console.error(`Error downloading ${filename}:`, err);
  });
}
}
(async () => {
  try {
    if (isFileNotEmpty([titlesTempPath, picTempPath, descTempPath, magnetLinksTempPath])) {
      if (shouldRunFunction()) {
        //cppProcess
        writingData();
        iterationSitemap();
        closeCppProcess()
      } else {
        console.log("Function is not allowed to run yet. Window and file operations skipped.");
      }
    } else {
      writingData();
    }
  } catch (error) {
    console.error("Error:", error);
  }
})();


