const axios = require("axios");
const fs = require("fs");
const { mkdir } = require("fs/promises");
require("dotenv").config();
const rateLimit = require("axios-rate-limit");

const HELPWISE_API_BASE_URL = "https://app.helpwise.io/dev-apis";

const hw = rateLimit(
  axios.create({
    baseURL: HELPWISE_API_BASE_URL,
    headers: {
      Authorization: `${process.env.HELPWISE_API_KEY}:${process.env.HELPWISE_API_SECRET}`,
    },
  }),
  { maxRequests: 1, perMilliseconds: 1000, maxRPS: 1 }
);

async function main() {
  let mailboxes = [];
  try {
    mailboxes = await getAllMailboxes();
  } catch (error) {
    throw error;
  }

  console.log(`Found ${mailboxes.length} mailboxes`);

  // create exported dir if not exists
  if (!fs.existsSync("mailboxes")) {
    await mkdir("mailboxes");
  }

  let mailboxCount = 0;
  for (const mailbox of mailboxes) {
    console.log(
      `Exporting data for mailbox ${mailbox.displayName} (${
        mailboxCount + 1
      } of ${mailboxes.length})`
    );

    try {
      await exportMailbox(mailbox);
    } catch (error) {
      throw error;
    }

    mailboxCount += 1;
  }
}

async function exportMailbox(mailbox) {
  // create mailbox dir if not exists
  const mbDir = `mailboxes/${mailbox.id}`;
  if (!fs.existsSync(mbDir)) {
    await mkdir(mbDir);
  }

  if (!fs.existsSync(`${mbDir}/threads`)) {
    await mkdir(`${mbDir}/threads`);
  }

  // first get the mailbox
  try {
    const mbResponse = await hw.post("/mailboxes/get", { id: mailbox.id });
    await fs.promises.writeFile(
      `${mbDir}/mailbox.json`,
      JSON.stringify(mbResponse.data.data, null, 2)
    );
  } catch (error) {
    throw error;
  }

  // get all threads
  let mbThreads = [];
  let allThreadsFetched = false;
  let page = 1;
  while (!allThreadsFetched) {
    let threadsResponse;
    try {
      threadsResponse = await hw.post("/threads/list", {
        mailboxId: mailbox.id,
      });
    } catch (error) {
      throw error;
    }

    if (
      threadsResponse.data.status === "success" &&
      threadsResponse.data.data.threads.length > 0
    ) {
      mbThreads = mbThreads.concat(threadsResponse.data.data.threads);
      console.log("mbThreads length: ", mbThreads.length); // TODO: remove

      // console.log("ABORTING LOOP early");
      // allThreadsFetched = true; // abort early TODO: remove

      page += 1;
    }

    if (threadsResponse.data.data.nextPage === false) {
      allThreadsFetched = true;
    }
  }

  console.log(`Fetched ${mbThreads.length} threads in mailbox`);

  // get all the emails for every thread
  let threadCount = 0;
  for (const thread of mbThreads) {
    // create thread dir if not exists
    if (!fs.existsSync(`${mbDir}/threads/${thread.id}`)) {
      await mkdir(`${mbDir}/threads/${thread.id}`);
    }

    await fs.promises.writeFile(
      `${mbDir}/threads/${thread.id}/thread.json`,
      JSON.stringify(thread, null, 2)
    );

    console.log(
      `Getting emails for thread ${threadCount + 1} of ${mbThreads.length}`
    );

    try {
      const emailsResponse = await hw.post("/threads/get", {
        mailbox_id: mailbox.id,
        thread_id: thread.id,
      });

      console.log("Emails: ", emailsResponse.data); // TODO: remove after understanding structure
      // write to disk
      await fs.promises.writeFile(
        `${mbDir}/threads/${thread.id}/emails.json`,
        JSON.stringify(emailsResponse.data.data, null, 2)
      );
    } catch (error) {
      throw error;
    }
  }
}

async function getAllMailboxes() {
  try {
    console.warn(
      "Warning: if your account has more than 20 mailboxes, tweak the parameters in getAllMailboxes()"
    );
    const response = await hw.post("/mailboxes/list", { page: 1, limit: 20 });
    return response.data.data;
  } catch (error) {
    throw error;
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
