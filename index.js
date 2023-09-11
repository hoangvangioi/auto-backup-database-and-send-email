const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const cron = require('node-cron');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const dbConfig = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
};

const pool = new Pool(dbConfig);

const backupDirectory = './backups';

if (!fs.existsSync(backupDirectory)) {
    fs.mkdirSync(backupDirectory);
}

app.get('/*', (req, res) => {
    res.redirect(301, process.env.URL_REDIRECT)
});

async function backupDatabase() {
    try {
        process.env.PGPASSWORD = process.env.DB_PASSWORD;

        const currentDate = new Date();
        const formattedDate = currentDate.toISOString().replace(/[:T\-]/g, '_').split('.')[0];
        const backupFileName = `backup_${formattedDate}.sql`;
        const backupFilePath = `${backupDirectory}/${backupFileName}`;

        const backupCommand = `pg_dump -h ${dbConfig.host} -U ${dbConfig.user} -d ${dbConfig.database} -E "UTF8" -f ${backupFilePath} --no-comments --clean --verbose --create`;
        
        await executeCommand(backupCommand);
        console.log('Sao lưu cơ sở dữ liệu thành công.');

        await sendEmailWithAttachment(backupFilePath);
    } catch (error) {
        throw error;
    } finally {
        delete process.env.PGPASSWORD;
    }
}

async function sendEmailWithAttachment(attachmentPath) {
    const smtpConfig = {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
    };

    const emailConfig = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_RECEIVE,
        subject: `Backup cơ sở dữ liệu - Time: ${new Date().toLocaleString()}`,
        text: 'Vui lòng tải đính kèm tệp sao lưu cơ sở dữ liệu.',
    };

    const fileContent = fs.readFileSync(attachmentPath);

    const transporter = nodemailer.createTransport(smtpConfig);

    emailConfig.attachments = [{
        filename: attachmentPath.split('/').pop(),
        content: fileContent,
    }];

    try {
        const info = await transporter.sendMail(emailConfig);
        console.log('Email đã được gửi:', info.response);
    } catch (error) {
        throw error;
    }
}

async function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

const cronTime = '0 2 */3 * *';

const cronJob = cron.schedule(cronTime, () => {
    backupDatabase()
        .then(() => {
            console.log('Đã sao lưu và gửi email.');
        })
        .catch((error) => {
            console.error('Lỗi khi sao lưu cơ sở dữ liệu hoặc gửi email:', error);
        });
});

cronJob.start();

app.listen(port, () => {
    console.log(`Server đang lắng nghe tại http://localhost:${port}`);
});
