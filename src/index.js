const _ = require('lodash');
const {
  rewriteTextAtPosition,
  insertTextAtPosition,
  escapeChars,
} = require('./utils')

const escapeCommonChars = text =>
  escapeChars(text, [
    '_',
    '*',
    '[',
    ']',
    '(',
    ')',
    '~',
    '`',
    '>',
    '#',
    '+',
    '-',
    '=',
    '|',
    '{',
    '}',
    '.',
    '!',
  ]);
const escapeCodeChars = text => escapeChars(text, ['`', '\\']);
const escapeLinkChars = text => escapeCommonChars(escapeChars(text, [')', '\\']));

const escapeMarkdownTextByEntity = (text, entity) => {
  if (entity.type === 'bold') {
    return escapeCommonChars(text);
  } else if (entity.type === 'italic') {
    return escapeCommonChars(text);
  } else if (entity.type === 'underline') {
    return escapeCommonChars(text);
  } else if (entity.type === 'strikethrough') {
    return escapeCommonChars(text);
  } else if (entity.type === 'code') {
    return escapeCodeChars(text);
  } else if (entity.type === 'pre') {
    return escapeCodeChars(text);
  } else if (entity.type === 'text_link') {
    return escapeLinkChars(text);
  } else if (entity.type === 'mention') {
    return escapeCommonChars(text);
  } else if (entity.type === 'text_mention') {
    return escapeLinkChars(text);
  } else if (entity.type === 'mention') {
    return escapeLinkChars(text);
  } else if (entity.type === 'url') {
    return escapeCommonChars(text);
  } else if (entity.type === 'hashtag') {
    return escapeCommonChars(text);
  } else if (entity.type === 'bot_command') {
    return escapeCommonChars(text);
  } else if (entity.type === 'cashtag') {
    return escapeCommonChars(text);
  } else if (entity.type === 'email') {
    return escapeCommonChars(text);
  } else if (entity.type === 'phone_number') {
    return escapeCommonChars(text);
  } else {
    return text;
  }
};

const wrapTextWithMarkdownEntity = (text, entity) => {
  let openTag = '';
  let closeTag = '';
  if (entity.type === 'pre') {
    openTag = `\`\`\`${entity.language ? entity.language + '\n' : '\n'}`;
    closeTag = '```';

    return `${openTag}${text}${closeTag}`;
  } else {
    if (entity.type === 'bold') {
      openTag = closeTag = '**';
    } else if (entity.type === 'italic') {
      openTag = closeTag = '*';
    } else if (entity.type === 'underline') {
      openTag = '<ins>';
      closeTag = '</ins>';
    } else if (entity.type === 'strikethrough') {
      openTag = closeTag = '~';
    } else if (entity.type === 'code') {
      openTag = closeTag = '```';
    } else if (entity.type === 'text_link') {
      openTag = '[';
      closeTag = `](${entity.url})`;
    } else if (entity.type === 'text_mention' || entity.type === 'mention') {
      openTag = '[';
      closeTag = `](https://t.me/${text.slice(1)})`;
    } else {
      return text;
    }

    const breakLinePosition = text.lastIndexOf('\n');
    if (breakLinePosition > -1 && text.endsWith('\n')) {
      text = insertTextAtPosition(text, breakLinePosition, closeTag);
      return `${openTag}${text}`;
    } else {
      return `${openTag}${text}${closeTag}`;
    }
  }
};

const fillMarkdownEntitiesMarkup = (text, entities) => {
  const entitiesChunks = _.groupBy(entities, 'offset');
  const topLevelEntities = _.reverse(
    Object.values(entitiesChunks).map(entitiesList => entitiesList[0])
  );

  const wrappedEscapedEntitiesArr = [];

  for (const entity of topLevelEntities) {
    let offset = 0;
    let modifiedText = text;
    let prevNestedWrappedText;

    // nested entities in length ascending order
    const nestedEntities = _.reverse(_.tail(entitiesChunks[entity.offset]));

    const processEntity = (text, entity) => {
      let accumOffset = 0; // accumulated offset after adding markup tags
      let entityText = text.substr(entity.offset, entity.length + offset);

      // if it's the most nested tag, then it's safe to escape
      if (typeof prevNestedWrappedText === 'undefined') {
        const escapedEntityText = escapeMarkdownTextByEntity(
          entityText,
          entity
        );

        accumOffset += escapedEntityText.length - entityText.length;
        entityText = escapedEntityText;
      } else {
        // getting the text difference between the previous entity text
        const diffEntityText = entityText.substr(
          prevNestedWrappedText.length,
          entityText.length - prevNestedWrappedText.length
        );
        // escape diff part
        const escapedDiffEntityText = escapeMarkdownTextByEntity(
          diffEntityText,
          entity
        );

        accumOffset += escapedDiffEntityText.length - diffEntityText.length;
        entityText = rewriteTextAtPosition(
          entityText,
          prevNestedWrappedText.length,
          escapedDiffEntityText,
          diffEntityText.length
        );
      }

      let wrappedNestedEntityText = wrapTextWithMarkdownEntity(
        entityText,
        entity
      );

      // fix italic/underline ambiguity
      if (entity.type === 'underline' || entity.type === 'italic') {
        wrappedNestedEntityText = `\r${wrappedNestedEntityText}\r`;
      }

      accumOffset += wrappedNestedEntityText.length - entityText.length;
      wrappedEscapedEntitiesArr.push([wrappedNestedEntityText, entity])

      text = rewriteTextAtPosition(
        text,
        entity.offset,
        wrappedNestedEntityText,
        entity.length + offset
      );

      offset += accumOffset;
      prevNestedWrappedText = wrappedNestedEntityText;

      return text;
    };

    for (const nestedEntity of nestedEntities) {
      modifiedText = processEntity(modifiedText, nestedEntity);
    }
    text = processEntity(modifiedText, entity);
  }

  return escapeNotInEntities(text, wrappedEscapedEntitiesArr);
};

const escapeNotInEntities = (text, wrappedArr) => {
  const escapeStr = (string) => {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  };

  let escapedOffsets = [];

  for (const str of wrappedArr) {
    const regex = text.match(escapeStr(str[0]));
    if (regex) {
      const offset = {
        start: regex.index,
        end: regex.index + str[0].length,
        string: text.substr(regex.index, str[0].length)
      };
      escapedOffsets.push(offset);
    }
  }
  
  let textToSplit = text;

  escapedOffsets = escapedOffsets.filter(n => 
    !escapedOffsets.find(m => 
      (m.string !== n.string) && (n.start >= m.start && n.end <= m.end)
    )
  );
  
  for (const offset of escapedOffsets) {
    textToSplit = textToSplit.replace(offset.string, "[splitKeyword]");
  }
  
  const subsToEscape = textToSplit.split("[splitKeyword]");
  
  for (const str of subsToEscape) {
    if (!str) continue;
    const escapedStr = escapeCommonChars(str);
    if (escapedStr !== str)
      text = text.replace(str, escapedStr);
  }

  return text;
};

module.exports = {
  fillMarkdownEntitiesMarkup,
  escapeCommonChars,
  escapeLinkChars,
  escapeCodeChars,
};
