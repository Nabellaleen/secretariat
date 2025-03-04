import ejs from 'ejs';
import BetaGouv from '../betagouv';
import * as utils from '../controllers/utils';
import knex from '../db';
import { DBUser, DBUserDetail, genderOptions, statusOptions } from '../models/dbUser';
import { Member, MemberWithEmailsAndMattermostUsername } from '../models/member';
import * as mattermost from '../lib/mattermost';
import { fetchCommuneDetails } from '../lib/searchCommune';
import { renderHtmlFromMd } from '../lib/mdtohtml';
import { sleep } from '../controllers/utils';

export async function sendMessageToUpdateInfoToAllUsers() {
    const allMattermostUsers = await mattermost.getUserWithParams();
    const allMattermostUsersEmails = allMattermostUsers.map(
        (mattermostUser) => mattermostUser.email
      );
    const users: Member[] = await BetaGouv.usersInfos();
    const activeUsers = users.filter((user) => !utils.checkUserIsExpired(user));
    const concernedUsers: DBUser[] = await knex('users')
      .whereIn(
        'username',
        process.env.FEATURE_SEND_MESSAGE_UPDATE_INFO_USERNAME ? [process.env.FEATURE_SEND_MESSAGE_UPDATE_INFO_USERNAME] : activeUsers.map((user) => user.id)
      );
    
    const concernedUserWithMattermostUsers : (MemberWithEmailsAndMattermostUsername & DBUser)[] = concernedUsers.map(
        (user) => {
            const index = allMattermostUsersEmails.indexOf(
              user.primary_email
            );
            const githubUser = activeUsers.find(ghUser => ghUser.id === user.username)
            return {
                ...githubUser,
                ...user,
                primary_email: user.primary_email,
                secondary_email: user.secondary_email,
                mattermostUsername: index > -1 ? allMattermostUsers[index].username : 'lucas.charrier',
            };
          }
    );
    
    for (const user of concernedUserWithMattermostUsers) {
        const userDetails: DBUserDetail = await knex('user_details').where({
            hash: utils.computeHash(user.id)
        }).then(res => res[0])
        const secretariatUrl = `https://secretariat.incubateur.net/`;
        const messageContent = await ejs.renderFile(
            `./src/views/templates/emails/updateUserInfoEmail.ejs`,
            {
                secretariatUrl,
                user: {
                    ...user,
                    startups: user.startups || [],
                    tjm: userDetails.tjm ? `${user.tjm} euros` : 'Non renseigné',
                    gender: genderOptions.find(opt => opt.key === userDetails.gender).name,
                    legal_status: user.legal_status ? statusOptions.find(opt => opt.key === user.legal_status).name : 'Non renseigné',
                    workplace_insee_code: user.workplace_insee_code ? await fetchCommuneDetails(user.workplace_insee_code).then(commune => commune.nom)  : 'Non renseigné',
                    secondary_email: user.secondary_email || 'Non renseigné'
                }
            }
        );
        if (process.env.FEATURE_SEND_MESSAGE_UPDATE_INFO) {
            try {
                
                await BetaGouv.sendInfoToChat(
                    messageContent,
                    'secretariat',
                    user.mattermostUsername
                );
                await sleep(1000);
            } catch (e) {
                console.log(`Erreur lors de l'envoie à ${user.mattermostUsername}`, e)
            }
            utils.sendMail(user.primary_email, 'Mise à jour de tes informations', renderHtmlFromMd(messageContent))
        }
        console.log(`Message d'update des info utilisateur envoyé à ${user.mattermostUsername}`)        
    }
}

sendMessageToUpdateInfoToAllUsers()
